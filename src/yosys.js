import {yosysTranslateIcons} from "./yosysIcons.js";
import {
    getPortSide,
    getPortNameSplice,
    isConst,
    addEdge,
    getConstNodeName,
    getTopModuleName,
    getNetNamesDict,
    orderClkAndRstPorts,
    hideChildrenAndNodes,
    getSourceAndTarget2,
    getSourceAndTargetForCell,
    updatePortIndicesNoHierarchy
} from "./yosysUtills.js";

import {aggregateConcantsAndSplits} from "./yosysConcatAndSplitAggregation.js";

import {setPortHierarchy} from "./yosysPortHierarchy.js";

import {aggregateHierarchicalPortEdges} from "./hierarchicalPortEdges.js";

function assertBuilderIdCounterBefore(parentBuilder, childBuilder){
    if (childBuilder === undefined) {
        return;
    }
    if (parseInt(parentBuilder.idCounter) > parseInt(childBuilder.idCounter)) {
        throw new Error("ParentBuilderIdCounter is bigger than childBuilderIdCounter (before)");
    }

}

function assertBuilderIdCounterAfter(parentBuilder, childBuilder){
    if (childBuilder === undefined) {
        return;
    }
    if (parseInt(parentBuilder.idCounter) < parseInt(childBuilder.idCounter)) {
        throw new Error("ParentBuilderIdCounter is smaller than childBuilderIdCounter (after)");
    }

}
/**
 * :ivar name: name of the node represented by LNodeMaker
 * :ivar yosysModule: module from which the node if built
 * :ivar idCounter: counter used to calculate a unique id of an object
 * :ivar yosysModules: all modules from yosys, used to generating children of the node
 * :ivar hierarchyLevel: specifies the depth of a node in a hierarchical node
 * :ivar nodePortNames: dictionary, which translates node ids to portByName
 * :ivar childrenWithoutPortArray: array, which stores tuples of cell objects and nodes,
 *                                 which do not have a port_directions attribute
 * :ivar nodeIdToCell: dictionary, which translates a node id to its corresponding cell object
 * :ivar nodeIdToBuilder: dictionary, which translates node id to its builder
 * :ivar portSuffixesAreEqual: function to compare two suffixes of a port name, it is used in allPortsAreConnected
* */
class LNodeMaker {
    constructor(name, yosysModule, idCounter, yosysModules, hierarchyLevel, nodePortNames, portSuffixesAreEqual) {
        this.name = name;
        this.yosysModule = yosysModule;
        this.idCounter = idCounter;
        this.yosysModules = yosysModules;
        this.hierarchyLevel = hierarchyLevel;
        this.nodePortNames = nodePortNames;
        this.childrenWithoutPortArray = [];
        this.nodeIdToCell = {};
        this.nodeIdToBuilder = {};
        this.portSuffixesAreEqual = portSuffixesAreEqual;
    }

    make() {
        if (this.name === undefined) {
            throw new Error("Name is undefined");
        }

        let node = this.makeNode(this.name);

        if (this.yosysModule) {
            // cell with module definition, load ports, edges and children from module def. recursively
            this.fillPorts(node, this.yosysModule.ports, (p) => {
                return p.direction
            }, undefined);
            this.fillChildren(node);
            this.fillEdges(node);

            if (node.children !== undefined && node.children.length > 0) {
                aggregateConcantsAndSplits(node);
            }
        }
        if (node.children !== undefined) {
            for (let child of node.children) {
                if (child.hwMeta.cls === "Operator" && child.hwMeta.name.startsWith("FF")) {
                    orderClkAndRstPorts(child);
                }
            }
            for (let child of node.children) {
                if (child.hwMeta.cls !== "Operator") {
                    setPortHierarchy(this, child, this.nodePortNames[child.id]);
                }

                let childBuilder = this.nodeIdToBuilder[child.id];
                if (childBuilder) {
                    childBuilder.idCounter = this.idCounter;
                    this.idCounter = undefined;
                }

                //assertBuilderIdCounterBefore(this, this.nodeIdToBuilder[child.id])
                aggregateHierarchicalPortEdges(this.nodeIdToBuilder[child.id], child, this.portSuffixesAreEqual);

                if (childBuilder) {
                    if (parseInt(child.hwMeta.maxId) < childBuilder.idCounter) {
                        //child.hwMeta.maxId = childBuilder.idCounter;
                    }
                    this.idCounter = childBuilder.idCounter;
                    childBuilder.idCounter = undefined;
                }
                //assertBuilderIdCounterAfter(this, this.nodeIdToBuilder[child.id])
            }
        }


        if (this.hierarchyLevel > 1) {
            hideChildrenAndNodes(node, this.yosysModule);
        }

        node.hwMeta.maxId = this.idCounter - 1;
        return node;
    }

    makeNode(name) {
        let node = {
            "id": this.idCounter.toString(), //generate, each component has unique id
            "hwMeta": { // [d3-hwschematic specific]
                "name": name, // optional str
                "cls": "", // optional str
                "maxId": 2, // max id of any object in this node used to avoid re-counting object if new object is generated
            },
            "properties": { // recommended renderer settings
                "org.eclipse.elk.portConstraints": "FIXED_ORDER", // can be also "FREE" or other value accepted by ELK
                "org.eclipse.elk.layered.mergeEdges": 1
            },
            "ports": [],    // list of LPort
            "edges": [],    // list of LEdge
            "children": [], // list of LNode
        };
        ++this.idCounter;
        return node;
    }

    fillPorts(node, ports, getPortDirectionFn, cellObj) {
        const isSplit = cellObj !== undefined && cellObj.type === "$slice";
        const isConcat = cellObj !== undefined && cellObj.type === "$concat";
        let portByName = this.nodePortNames[node.id];
        if (portByName === undefined) {
            portByName = {};
            this.nodePortNames[node.id] = portByName;
        }
        for (let [portName, portObj] of Object.entries(ports)) {
            let originalPortName = portName;
            if (isSplit || isConcat) {

                if (isSplit) {
                    if (portName === "A") {
                        portName = "";
                    } else if (portName === "Y") {
                        portName = getPortNameSplice(cellObj.parameters.OFFSET, cellObj.parameters.Y_WIDTH);
                    }
                } else if (isConcat) {
                    let par = cellObj.parameters;

                    if (portName === "Y") {
                        portName = "";
                    } else if (portName === "A") {
                        portName = getPortNameSplice(0, par.A_WIDTH);
                    } else if (portName === "B") {
                        portName = getPortNameSplice(par.A_WIDTH, par.B_WIDTH);
                    }
                }
            }
            let direction = getPortDirectionFn(portObj);
            this.makeLPort(node.ports, portByName, originalPortName, portName, direction, node.hwMeta.name, node);
        }
        if (isConcat) {
            node.ports = node.ports.reverse();
            updatePortIndicesNoHierarchy(node.ports);
        }
    }

    makeLPort(portList, portByName, originalName, name, direction, nodeName, node) {
        if (name === undefined) {
            throw new Error("Name is undefined");
        }

        let portSide = getPortSide(name, direction, nodeName);
        let port = {
            "id": this.idCounter.toString(),
            "hwMeta": { // [d3-hwschematic specific]
                "name": name,
            },
            "direction": direction.toUpperCase(), // [d3-hwschematic specific] controls direction marker
            "properties": {
                "side": portSide,
                "index": 0 // The order is assumed as clockwise, starting with the leftmost port on the top side.
                // Required only for components with "org.eclipse.elk.portConstraints": "FIXED_ORDER"
            },
            "children": [], // list of LPort, if the port should be collapsed rename this property to "_children"
        };
        port.properties.index = portList.length;
        portList.push(port);
        portByName[originalName] = port;
        ++this.idCounter;
        node.hwMeta.maxId = this.idCounter - 1;
        return port;
    }

    fillChildren(node) {
        // iterate all cells and lookup for modules and construct them recursively
        for (const [cellName, cellObj] of Object.entries(this.yosysModule.cells)) {
            let moduleName = cellObj.type; //module name
            let cellModuleObj = this.yosysModules[moduleName];
            let nodeBuilder = new LNodeMaker(cellName, cellModuleObj, this.idCounter, this.yosysModules,
                this.hierarchyLevel + 1, this.nodePortNames, this.portSuffixesAreEqual);
            let subNode = nodeBuilder.make();
            this.nodeIdToBuilder[subNode.id] = nodeBuilder;
            this.idCounter = nodeBuilder.idCounter;
            node.children.push(subNode);
            yosysTranslateIcons(subNode, cellObj);
            this.nodeIdToCell[subNode.id] = cellObj;
            if (cellModuleObj === undefined) {
                if (cellObj.port_directions === undefined) {
                    this.childrenWithoutPortArray.push([cellObj, subNode]);
                    continue;
                }
                this.fillPorts(subNode, cellObj.port_directions, (p) => {
                    return p;
                }, cellObj);
            }
        }
    }

    fillEdges(node) {

        let edgeTargetsDict = {};
        let edgeSourcesDict = {};
        let constNodeDict = {};
        let [edgeDict, edgeArray] = this.getEdgeDictFromPorts(
            node, constNodeDict, edgeTargetsDict, edgeSourcesDict);
        let netnamesDict = getNetNamesDict(this.yosysModule);

        function getPortName(bit) {
            return netnamesDict[bit];
        }

        for (let i = 0; i < node.children.length; i++) {
            const subNode = node.children[i];
            if (constNodeDict[subNode.id] === 1) {
                //skip constants to iterate original cells
                continue;
            }

            let cell = this.nodeIdToCell[subNode.id];
            if (cell.port_directions === undefined) {
                continue;
            }
            let connections = cell.connections;
            let portDirections = cell.port_directions;


            if (connections === undefined) {
                throw new Error("Cannot find cell for subNode" + subNode.hwMeta.name);
            }

            let portI = 0;
            let portByName = this.nodePortNames[subNode.id];
            for (const [portName, bits] of Object.entries(connections)) {
                let portObj;
                let direction;
                if (portName.startsWith("$")) {
                    portObj = subNode.ports[portI++]
                    direction = portObj.direction.toLowerCase(); //use direction from module port definition
                } else {
                    portObj = portByName[portName];
                    direction = portDirections[portName];
                }

                this.loadNets(node, subNode.id, portObj.id, bits, direction, edgeDict, constNodeDict,
                    edgeArray, getPortName, getSourceAndTargetForCell, edgeTargetsDict, edgeSourcesDict);

            }
        }
        // source null target null == direction is output

        for (const [cellObj, subNode] of this.childrenWithoutPortArray) {
            for (const [portName, bits] of Object.entries(cellObj.connections)) {
                let port = null;
                for (const bit of bits) {
                    let edge = edgeDict[bit];
                    if (edge === undefined) {
                        throw new Error("[Todo] create edge");
                    }
                    let edgePoints;
                    let direction;
                    if (edge.sources.length === 0 && edge.targets.length === 0) {
                        direction = "output";
                        edgePoints = edge.sources;
                    } else if (edge.sources.length === 0) {
                        // no sources -> add as source
                        direction = "output";
                        edgePoints = edge.sources;
                    } else {
                        direction = "input";
                        edgePoints = edge.targets;
                    }

                    if (port === null) {
                        let portByName = this.nodePortNames[subNode.id];
                        if (portByName === undefined) {
                            portByName = {};
                            this.nodePortNames[subNode.id] = portByName;
                        }
                        port = this.makeLPort(subNode.ports, portByName, portName, portName, direction, subNode.hwMeta.name, subNode);
                    }

                    edgePoints.push([subNode.id, port.id]);
                }
            }

        }

        let edgeSet = {}; // [sources, targets]: true
        for (const edge of edgeArray) {
            let key = [edge.sources, null, edge.targets]
            if (!edgeSet[key]) // filter duplicities
            {
                edgeSet[key] = true;
                node.edges.push(edge);
            }
        }

    }

    getEdgeDictFromPorts(node, constNodeDict, edgeTargetsDict, edgeSourcesDict) {
        let edgeDict = {}; // yosys bits (netId): LEdge
        let edgeArray = [];
        let portsIndex = 0;
        for (const [portName, portObj] of Object.entries(this.yosysModule.ports)) {
            let port = node.ports[portsIndex];
            portsIndex++;

            function getPortName2() {
                return portName;
            }

            this.loadNets(node, node.id, port.id, portObj.bits, portObj.direction,
                edgeDict, constNodeDict, edgeArray, getPortName2, getSourceAndTarget2,
                edgeTargetsDict, edgeSourcesDict)

        }
        return [edgeDict, edgeArray];
    }

    /*
     * Iterate bits representing yosys net names, which are used to get edges from the edgeDict.
     * If edges are not present in the dictionary, they are created and inserted into it. Eventually,
     * nodes are completed by filling sources and targets properties of LEdge.
     */
    loadNets(node, nodeId, portId, bits, direction, edgeDict, constNodeDict, edgeArray,
             getPortName, getSourceAndTarget, edgeTargetsDict, edgeSourcesDict) {
        for (let i = 0; i < bits.length; ++i) {
            let startIndex = i;
            let width = 1;
            let bit = bits[i];
            let portName = getPortName(bit);
            let edge = edgeDict[bit];
            let netIsConst = isConst(bit);
            if (netIsConst || edge === undefined) {
                // create edge if it is not in edgeDict
                if (portName === undefined) {
                    if (!netIsConst) {
                        throw new Error("Netname is undefined");
                    }
                    portName = bit;
                }
                edge = this.makeLEdge(portName);
                edgeDict[bit] = edge;
                edgeArray.push(edge);
                if (netIsConst) {
                    i = this.addConstNodeToSources(node, bits, edge.sources, i, constNodeDict);
                    width = i - startIndex + 1;
                }
            }

            let [a, b, targetA, targetB] = getSourceAndTarget(edge);
            if (direction === "input") {
                a.push([nodeId, portId]);
                if (targetA) {
                    addEdge(edge, portId, edgeTargetsDict, startIndex, width);
                } else {
                    addEdge(edge, portId, edgeSourcesDict, startIndex, width)
                }
            } else if (direction === "output") {
                b.push([nodeId, portId]);
                if (targetB) {
                    addEdge(edge, portId, edgeTargetsDict, startIndex, width);
                } else {
                    addEdge(edge, portId, edgeSourcesDict, startIndex, width);
                }
            } else {
                throw new Error("Unknown direction " + direction);
            }
        }
    }

    makeLEdge(name) {
        if (name === undefined) {
            throw new Error("Name is undefined");
        }
        let edge = {
            "id": this.idCounter.toString(),
            "sources": [],
            "targets": [], // [id of LNode, id of LPort]
            "hwMeta": { // [d3-hwschematic specific]
                "name": name, // optional string, displayed on mouse over
            }
        };
        ++this.idCounter;
        return edge;
    }

    addConstNodeToSources(node, bits, sources, i, constNodeDict) {
        let nameArray = [];
        for (i; i < bits.length; ++i) {
            let bit = bits[i];
            if (isConst(bit)) {
                nameArray.push(bit);
            } else {
                break;
            }
        }
        --i;
        // If bit is a constant, create a node with constant
        let nodeName = getConstNodeName(nameArray);
        let constSubNode;
        let port;
        [constSubNode, port] = this.addConstNode(node, nodeName, constNodeDict);
        sources.push([constSubNode.id, port.id]);
        return i;
    }

    addConstNode(node, nodeName, constNodeDict) {
        let port;

        let nodeBuilder = new LNodeMaker(nodeName, undefined, this.idCounter, null,
            this.hierarchyLevel + 1, this.nodePortNames, this.portSuffixesAreEqual);
        let subNode = nodeBuilder.make();
        this.idCounter = nodeBuilder.idCounter;

        let portByName = this.nodePortNames[subNode.id] = {};
        port = this.makeLPort(subNode.ports, portByName, "O0", "O0", "output", subNode.hwMeta.name, subNode);
        node.children.push(subNode);
        constNodeDict[subNode.id] = 1;

        return [subNode, port];
    }


}

function isDuplicit(node, idDict) {
    if (idDict[node.id] === undefined)
    {
        idDict[node.id] = node;
    } else {
        throw new Error(("Duplicit id detected: " + node.id + ": " + node.hwMeta.name + " and "  + node.id + ": " + idDict[node.id].hwMeta.name));
    }
}
function detectDuplicitIds(node, idDict) {
    isDuplicit(node, idDict);
    let children = node.children || node._children
    if (children !== undefined) {
        for (let child of children) {
            detectDuplicitIds(child, idDict);
        }
    }
    let edges = node.edges || node._edges;
    if (edges !== undefined) {
        for (let edge of edges) {
            detectDuplicitIds(edge, idDict)
        }
    }

    let ports = node.ports || node._ports;
    if (ports !== undefined) {
        for (let port of ports) {
            detectDuplicitIds(port, idDict)
        }
    }
}

function checkMaxIdPorts(maxId, port) {
    if (maxId < parseInt(port.id))
    {
        throw new Error("Max ids are not correct (port)");
    }

    for (let childPort of port.children) {
        checkMaxIdPorts(maxId, childPort)
    }
}

function checkMaxId(node) {
    let maxId = parseInt(node.hwMeta.maxId);
    let children = node.children || node._children
    if (children !== undefined) {
        for (let child of children) {
            checkMaxId(child);
            if (maxId < parseInt(child.id)) {
                throw new Error("Max ids are not correct (child)");
            }
        }
    }

    if (maxId < parseInt(node.id)) {
        throw new Error("Max ids are not correct (self)");
    }

    let edges = node.edges || node._edges;
    if (edges !== undefined) {
        for (let edge of edges) {
            if (maxId < parseInt(edge.id))
            {
                throw new Error("Max ids are not correct (edge)");
            }
        }
    }

    let ports = node.ports || node._ports;
    if (ports !== undefined) {
        for (let port of ports) {
            checkMaxIdPorts(maxId, port)
        }
    }



}
export function yosys(yosysJson) {

    function portSuffixesAreEqual(leftSuffix, rightSuffix) {
        return leftSuffix === rightSuffix
    }
    /*
    function portSuffixesAreEqual(leftSuffix, rightSuffix) {
        if ((leftSuffix.endsWith("_i") && rightSuffix.endsWith("_o"))
            || (leftSuffix.endsWith("_o") && rightSuffix.endsWith("_i"))){
            leftSuffix = leftSuffix.slice(0, leftSuffix.length  - 2);
            rightSuffix = rightSuffix.slice(0, rightSuffix.length  - 2)
        }
        return leftSuffix === rightSuffix;
    }
    */

    let nodePortNames = {};
    let rootNodeBuilder = new LNodeMaker("root", null, 0, null, 0, nodePortNames, portSuffixesAreEqual);
    let output = rootNodeBuilder.make();
    let topModuleName = getTopModuleName(yosysJson);

    let nodeBuilder = new LNodeMaker(topModuleName, yosysJson.modules[topModuleName], rootNodeBuilder.idCounter,
        yosysJson.modules, 1, nodePortNames, portSuffixesAreEqual);
    let node = nodeBuilder.make();
    output.children.push(node);

    setPortHierarchy(nodeBuilder, node, nodeBuilder.nodePortNames[node.id]);
    aggregateHierarchicalPortEdges(nodeBuilder, output.children[0], nodeBuilder.portSuffixesAreEqual);
    output.hwMeta.maxId = nodeBuilder.idCounter - 1;

    //print output to console
    //console.log(JSON.stringify(output, null, 2));

    //detectDuplicitIds(node, {});
    //console.log("[SUCCESS] detectDuplicitIds: no duplicit ids were found");

    //checkMaxId(node);
    return output;
}
