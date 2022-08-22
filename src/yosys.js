import {yosysTranslateIcon} from "./yosysIcons.js";
import {
    getPortSide,
    getPortNameSplice,
    isConst,
    addEdge,
    getConstNodeName,
    getTopModule,
    getNetNamesDict,
    orderClkAndRstPorts,
    hideChildrenAndNodes,
    getSourceAndTarget2,
    getSourceAndTargetForCell,
    updatePortIndicesNoHierarchy
} from "./yosysUtills.js";

import {aggregateConcatsAndSlices} from "./yosysConcatAndSplitAggregation.js";
import {setPortHierarchy} from "./yosysPortHierarchy.js";
import {aggregateHierarchicalPortEdges} from "./hierarchicalPortEdges.js";


/**
 * :ivar name: name of the node represented by LNodeBuilder
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
 *                             function
* */
class LNodeBuilder {
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

    build(hierarchyLevelLimit) {
        if (this.name === undefined) {
            throw new Error("Name is undefined");
        }

        let node = this.buildNode(this.name);

        if (this.yosysModule) {
            this.loadNodeObjectsFromYosysModule(node, hierarchyLevelLimit, this.yosysModule);
        }

        if (node.children !== undefined) {
            this.normalizePortsAndEdgesOfChildren(node.children);
        }

        if (this.yosysModule !== null) { // to skip root
            this.hideNodeObjects(node);

        }

        node.hwMeta.maxId = this.idCounter - 1;
        return node;
    }

    buildNode(name) {
        let node = {
            "id": this.idCounter.toString(), //each component has a unique id
            "hwMeta": { // [d3-hwschematic specific]
                "name": name, // optional str
                "cls": "", // optional str
                "maxId": 2, // max id of any object in this node used to avoid re-counting object if new object is
                            // generated
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

    loadNodeObjectsFromYosysModule(node, hierarchyLevelLimit) {
        // cell with module definition, load ports, edges and children from module definition recursively
        this.fillPorts(node, this.yosysModule.ports, (p) => {
            return p.direction
        }, undefined);
        if (typeof(hierarchyLevelLimit) === "undefined" || hierarchyLevelLimit > 0) {
            this.fillChildren(node, hierarchyLevelLimit);
            this.fillEdges(node);
        }

        if (node.children !== undefined && node.children.length > 0) {
            aggregateConcatsAndSlices(node);
        }
}


    fillPorts(node, ports, getPortDirectionFn, cellObj) {
        const isSlice = cellObj !== undefined && cellObj.type === "$slice";
        const isConcat = cellObj !== undefined && cellObj.type === "$concat";
        let portByName = this.getPortByNameDictForNode(node);

        for (let [portName, portObj] of Object.entries(ports)) {
            let originalPortName = portName;
            portName = LNodeBuilder.getPortName(isSlice, isConcat, portName, cellObj);
            let direction = getPortDirectionFn(portObj);
            this.makeLPort(node, portName, originalPortName, direction, node.ports, portByName);
        }
        if (isConcat) {
            node.ports = node.ports.reverse();
            updatePortIndicesNoHierarchy(node.ports);
        }
    }
    getPortByNameDictForNode(node) {
        let portByName = this.nodePortNames[node.id];
        if (portByName === undefined) {
            portByName = {};
            this.nodePortNames[node.id] = portByName;
        }

        return portByName;
    }

    static getPortName(isSlice, isConcat, portName, cellObj) {
        if (isSlice || isConcat) {

            if (isSlice) {
                if (portName === "A") {
                    return "";
                } else if (portName === "Y") {
                    return getPortNameSplice(cellObj.parameters.OFFSET, cellObj.parameters.Y_WIDTH);
                }
            } else if (isConcat) {
                let par = cellObj.parameters;

                if (portName === "Y") {
                    return "";
                } else if (portName === "A") {
                    return getPortNameSplice(0, par.A_WIDTH);
                } else if (portName === "B") {
                    return getPortNameSplice(par.A_WIDTH, par.B_WIDTH);
                }
            }
        }
        return portName
    }



    makeLPort(node, portName, originalPortName, direction, portList, portByName) {
        if (portName === undefined) {
            throw new Error("Name is undefined");
        }

        let port = {
            "id": this.idCounter.toString(),
            "hwMeta": { // [d3-hwschematic specific]
                "name": portName,
            },
            "direction": direction.toUpperCase(), // [d3-hwschematic specific] controls direction marker
            "properties": {
                "side": getPortSide(portName, direction, node.hwMeta.name),
                "index": portList.length // The order is assumed as clockwise, starting with the leftmost port on the top side.
                                         // Required only for components with "org.eclipse.elk.portConstraints": "FIXED_ORDER"
            },
            "children": [], // list of LPort, if the port should be collapsed rename this property to "_children"
        };
        portList.push(port);
        portByName[originalPortName] = port;
        ++this.idCounter;
        node.hwMeta.maxId = this.idCounter - 1;
        return port;
    }

    fillChildren(node, hierarchyLevelLimit) {
        // iterate all cells and lookup for modules and construct them recursively
        for (const [cellName, cellObj] of Object.entries(this.yosysModule.cells)) {
            let moduleName = cellObj.type; //module name
            let cellModuleObj = this.yosysModules[moduleName];

            let nodeBuilder = new LNodeBuilder(cellName, cellModuleObj, this.idCounter, this.yosysModules,
                                   this.hierarchyLevel + 1, this.nodePortNames, this.portSuffixesAreEqual);
            let hierarchyLevelLimitIsUndef = typeof hierarchyLevelLimit === "undefined";
            let subNode = nodeBuilder.build(hierarchyLevelLimitIsUndef ? undefined :
                                            hierarchyLevelLimit - 1);
            node.children.push(subNode);

            this.nodeIdToBuilder[subNode.id] = nodeBuilder;
            this.idCounter = nodeBuilder.idCounter;
            this.nodeIdToCell[subNode.id] = cellObj;

            yosysTranslateIcon(subNode, cellObj);

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
        this.createEdges(node, constNodeDict, edgeDict, edgeArray, getPortName, edgeTargetsDict, edgeSourcesDict);
        this.completeEdgesForChildrenWithoutPort(edgeDict);

        this.filterDuplicitEdges(node, edgeArray);
    }

    filterDuplicitEdges(node, edgeArray) {
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

    createEdges(node, constNodeDict, edgeDict, edgeArray, getPortName, edgeTargetsDict, edgeSourcesDict) {
        for (const child of node.children) {
            let cell = this.nodeIdToCell[child.id];

            if (constNodeDict[child.id] === 1 || cell.port_directions === undefined) {
                //skip constants to iterate original cells
                continue;
            }

            let connections = cell.connections;
            if (connections === undefined) {
                throw new Error("Cannot find cell for subNode" + child.hwMeta.name);
            }

            this.loadConnections(node, child, cell, connections, constNodeDict, edgeDict, edgeArray,
                                 getPortName, edgeTargetsDict, edgeSourcesDict);
        }
        // source null and target null == direction is output

    }

    completeEdgesForChildrenWithoutPort(edgeDict) {
        for (const [cellObj, child] of this.childrenWithoutPortArray) {
            for (const [portName, bits] of Object.entries(cellObj.connections)) {
                let port = null;
                for (const bit of bits) {
                    let edge = edgeDict[bit];
                    if (edge === undefined) {
                        throw new Error("[Todo] create edge");
                    }
                    let [edgePoints, direction] = this.getEdgePointsAndDirection(edge);

                    if (port === null) {
                        let portByName = this.nodePortNames[child.id];
                        if (portByName === undefined) {
                            portByName = {};
                            this.nodePortNames[child.id] = portByName;
                        }
                        port = this.makeLPort(child, portName, portName, direction, child.ports, portByName);
                    }

                    edgePoints.push([child.id, port.id]);
                }
            }

        }
    }

    loadConnections(node, child, cell, connections, constNodeDict, edgeDict, edgeArray,
                    getPortName, edgeTargetsDict, edgeSourcesDict) {
        let portI = 0;
        for (const [portName, bits] of Object.entries(connections)) {
            let portObj;
            let direction;
            if (portName.startsWith("$")) {
                portObj = child.ports[portI++]
                direction = portObj.direction.toLowerCase(); //use direction from module port definition
            } else {
                let portByName = this.nodePortNames[child.id];
                portObj = portByName[portName];
                direction = cell.port_directions[portName];
            }

            this.translateBitsToNets(node, child.id, portObj.id, bits, direction, edgeDict, constNodeDict,
                edgeArray, getPortName, getSourceAndTargetForCell, edgeTargetsDict, edgeSourcesDict);
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

            this.translateBitsToNets(node, node.id, port.id, portObj.bits, portObj.direction,
                edgeDict, constNodeDict, edgeArray, getPortName2, getSourceAndTarget2,
                edgeTargetsDict, edgeSourcesDict)

        }
        return [edgeDict, edgeArray];
    }
    getEdgePointsAndDirection(edge) {
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

        return [edgePoints, direction]

    }

    /*
     * Iterate bits representing yosys net names, which are used to get edges from the edgeDict.
     * If edges are not present in the dictionary, they are created and inserted into it. Eventually,
     * nodes are completed by filling sources and targets properties of LEdge.
     */
    translateBitsToNets(node, childId, portId, bits, direction, edgeDict, constNodeDict, edgeArray,
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
                a.push([childId, portId]);
                if (targetA) {
                    addEdge(edge, portId, edgeTargetsDict, startIndex, width);
                } else {
                    addEdge(edge, portId, edgeSourcesDict, startIndex, width)
                }
            } else if (direction === "output") {
                b.push([childId, portId]);
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

        let nodeBuilder = new LNodeBuilder(nodeName, undefined, this.idCounter, null,
            this.hierarchyLevel + 1, this.nodePortNames, this.portSuffixesAreEqual);
        let subNode = nodeBuilder.build(undefined);
        this.idCounter = nodeBuilder.idCounter;

        let portByName = this.nodePortNames[subNode.id] = {};
        port = this.makeLPort(subNode, "O0", "O0", "output", subNode.ports, portByName);
        node.children.push(subNode);
        constNodeDict[subNode.id] = 1;

        return [subNode, port];
    }

    normalizePortsAndEdgesOfChildren(children) {
        orderClkAndRstPorts(children);
        this.normalizePortsAndEdges(children);
    }

    normalizePortsAndEdges(children) {
        for (let child of children) {
            if (child.hwMeta.cls !== "Operator") {
                setPortHierarchy(this, child, this.nodePortNames[child.id]);
            }
            let childBuilder = this.nodeIdToBuilder[child.id];
            if (childBuilder) {
                childBuilder.idCounter = this.idCounter;
                this.idCounter = undefined;
            }
            aggregateHierarchicalPortEdges(this.nodeIdToBuilder[child.id], child, this.portSuffixesAreEqual);

            if (childBuilder) {
                this.idCounter = childBuilder.idCounter;
                childBuilder.idCounter = undefined;
            }
        }

    }

    hideNodeObjects(node) {
        if (this.hierarchyLevel > 1) {
            hideChildrenAndNodes(node);
        } else if (node.children.length === 0 && node.edges.length === 0) {
            delete node.children
            delete node.edges;
        }

    }
}

function buildMainComponentNode(output, yosysJson, rootNodeBuilder, nodePortNames, portSuffixesAreEqual,
                                hierarchyLevelLimitIsUndef, hierarchyLevelLimit) {
    let [topModuleName, topModuleObj] = getTopModule(yosysJson);
    let nodeBuilder = new LNodeBuilder(topModuleName,
                                       topModuleObj,
                                       rootNodeBuilder.idCounter,
                                       yosysJson.modules,
                                       1,
                                       nodePortNames,
                                       portSuffixesAreEqual);
    let mainComponentNode = nodeBuilder.build(hierarchyLevelLimitIsUndef ?
                                              undefined : hierarchyLevelLimit - 1);
    output.children.push(mainComponentNode);
    setPortHierarchy(nodeBuilder, mainComponentNode, nodeBuilder.nodePortNames[mainComponentNode.id]);
    aggregateHierarchicalPortEdges(nodeBuilder, output.children[0], nodeBuilder.portSuffixesAreEqual);

    return nodeBuilder;
}
export function yosys(yosysJson, hierarchyLevelLimit, portSuffixesAreEqual) {
    let nodePortNames = {};

    let rootNodeBuilder = new LNodeBuilder("root", null, 0, null,
                                           0, nodePortNames, portSuffixesAreEqual);
    let hierarchyLevelLimitIsUndef = typeof hierarchyLevelLimit === "undefined";
    let output = rootNodeBuilder.build(hierarchyLevelLimitIsUndef ? undefined : hierarchyLevelLimit - 1);

    if (hierarchyLevelLimitIsUndef || hierarchyLevelLimit > 0) {
        let nodeBuilder = buildMainComponentNode(output, yosysJson, rootNodeBuilder, nodePortNames,
                                                 portSuffixesAreEqual, hierarchyLevelLimitIsUndef, hierarchyLevelLimit)
        output.hwMeta.maxId = nodeBuilder.idCounter - 1;

    } else {
        output.hwMeta.maxId = rootNodeBuilder.idCounter - 1;
    }
    //print output to console
    //console.log(JSON.stringify(output, null, 2));
    return output;
}
