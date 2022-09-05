import {
    getPortSide,
    isConst,
    addEdge,
    getConstNodeName,
    getNetNamesDict,
    orderClkAndRstPorts,
    getSourceAndTarget2,
    getSourceAndTargetForCell,
    updatePortIndicesNoHierarchy, hideNodeObjects, getPortName, convertPortOrderingFromYosysToElk
} from "./yosysUtills.js";

import {aggregateConcatsAndSlices} from "./yosysConcatAndSplitAggregation.js";
import {collectPortIdToParentObjDict, discoverPortHierarchy} from "./yosysPortHierarchy.js";
import {aggregateHierarchicalPortEdges} from "./yosysHierarchicalPortEdges.js";
import {yosysTranslateIcon} from "./yosysIcons.js";


export class IdCounter {
    constructor() {
        this.id = 0;
    }

    getNextId() {
        let nextId = this.id;
        ++this.id;
        return nextId;
    }
}

/**
 * :ivar name: name of the node represented by LNodeBuilder
 * :ivar yosysModule: module from which the node if built
 * :ivar idCounter: counter used to calculate a unique id of an object
 * :ivar yosysModules: all modules from yosys, used to generating children of the node
 * :ivar hierarchyLevel: specifies the depth of a node in a hierarchical node
 * :ivar nodePortNames: dictionary, which translates node ids to portByName dictionary
 * :ivar childrenWithoutPortArray: array, which stores tuples of cell objects and nodes,
 *                                 which do not have a port_directions attribute
 * :ivar nodeIdToCell: dictionary, which translates a node id to its corresponding cell object
 * :ivar nodeIdToBuilder: dictionary, which translates node id to its builder
 * :ivar portSuffixesAreEqual: function to compare two suffixes of a port name, it is used in allPortsAreConnected
 *                             function
 * :ivar portIdToParentDict: A dictionary mapping port id to id of its parent.
 * */
export class LNodeBuilder {

    constructor(name, yosysModule, idCounter, yosysModules, hierarchyLevel, nodePortNames,
                portSuffixesAreEqual, nodeIdToBuilder, portIdToParentDict) {
        this.name = name;
        this.yosysModule = yosysModule;
        this.idCounter = idCounter;
        this.yosysModules = yosysModules;
        this.hierarchyLevel = hierarchyLevel;
        this.nodePortNames = nodePortNames;
        this.childrenWithoutPortArray = [];
        this.nodeIdToCell = {};
        this.nodeIdToBuilder = nodeIdToBuilder;
        this.portSuffixesAreEqual = portSuffixesAreEqual;
        this.portIdToParentDict = portIdToParentDict;
    }

    build(hierarchyLevelLimit, node, loadPortsFromYosys, lookupPortsUsingName) {
        if (this.name === undefined) {
            throw new Error("Name is undefined");
        }
        const isNewNode = !node;
        if (isNewNode) {
            node = this.createLNode(this.name);
            this.nodeIdToBuilder[node.id] = this;
        }

        if (this.yosysModule) {
            this.loadLNodeFromYosysModule(node, hierarchyLevelLimit, loadPortsFromYosys, lookupPortsUsingName);
        }

        if (node.children) {
            this.normalizePortsAndEdgesOfChildren(node.children);
        }
        let hierarchyLevelLimitIsUndef = typeof hierarchyLevelLimit === "undefined"
        if (node.children.length === 0 && node.edges.length === 0) { // to skip root
            delete node.children
            delete node.edges;
        } else if ((hierarchyLevelLimitIsUndef && this.hierarchyLevel > 1) ||
                (!hierarchyLevelLimitIsUndef && this.hierarchyLevel > hierarchyLevelLimit)) {
            hideNodeObjects(node, this.hierarchyLevel);
        }
        node.hwMeta.maxId = this.idCounter.id - 1;
        if (!isNewNode) {
            // because ports are now aggregated and root already called normalizePortsAndEdgesOfChildren
            // when this node was collapsed
            aggregateHierarchicalPortEdges(this, node, this.portSuffixesAreEqual, this.portIdToParentDict);
        }
        return node;
    }

    normalizePortsAndEdgesOfChildren(children) {
        for (let child of children) {
            const isOperator = child.hwMeta.cls === "Operator";
            if (isOperator) {
                orderClkAndRstPorts(child);
            }
            if (!isOperator) {
                discoverPortHierarchy(this, child, this.nodePortNames[child.id]);
            }

            for (const p of child.ports) {
                collectPortIdToParentObjDict(child, p, this.portIdToParentDict);
            }
            if (!isOperator) {
                // todo if hierarchy limit is not exceeded
                aggregateHierarchicalPortEdges(this, child, this.portSuffixesAreEqual, this.portIdToParentDict);
            }
        }
    }

    createLNode(name) {
        let node = {
            "id": this.idCounter.getNextId().toString(), //each component has a unique id
            "hwMeta": { // [d3-hwschematic specific]
                "name": name, // optional str
                "cls": "", // optional str
            },
            "properties": { // recommended renderer settings
                "org.eclipse.elk.portConstraints": "FIXED_ORDER", // can be also "FREE" or other value accepted by ELK
                "org.eclipse.elk.layered.mergeEdges": 1
            },
            "ports": [],    // list of LPort
            "edges": [],    // list of LEdge
            "children": [], // list of LNode
        };
        return node;
    }

    createLPort(node, portName, originalPortName, direction, portList, portByName) {
        if (portName === undefined) {
            throw new Error("Name is undefined");
        }

        let port = {
            "id": this.idCounter.getNextId().toString(),
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
        node.hwMeta.maxId = this.idCounter.id - 1;

        return port;
    }

    createLEdge(name) {
        if (name === undefined) {
            throw new Error("Name is undefined");
        }
        let edge = {
            "id": this.idCounter.getNextId().toString(),
            "sources": [],
            "targets": [], // [id of LNode, id of LPort]
            "hwMeta": { // [d3-hwschematic specific]
                "name": name, // optional string, displayed on mouse over
            }
        };
        return edge;
    }

    loadLNodeFromYosysModule(node, hierarchyLevelLimit, loadPortsFromYosys, lookupPortsUsingName) {
        // cell with module definition, load ports, edges and children from module definition recursively
        if (loadPortsFromYosys) {
            this.loadLNodePortsFromYosysModule(node, this.yosysModule.ports, (p) => {
                return p.direction
            }, undefined);
        }
        if (typeof hierarchyLevelLimit === "undefined" || this.hierarchyLevel <= hierarchyLevelLimit) {
            this.loadLNodeChildrenFromYosysModule(node, hierarchyLevelLimit);
            this.loadLNodeEdgesFromYosysModule(node, lookupPortsUsingName);
        }

        if (node.children !== undefined && node.children.length > 0) {
            aggregateConcatsAndSlices(node);
        }
    }

    loadLNodePortsFromYosysModule(node, ports, getPortDirectionFn, cellObj) {
        const isSlice = cellObj !== undefined && cellObj.type === "$slice";
        const isConcat = cellObj !== undefined && cellObj.type === "$concat";
        let portByName = this.nodePortNames[node.id];
        if (typeof portByName === "undefined") {
            portByName = {};
            this.nodePortNames[node.id] = portByName;
        }

        for (let [portName, portObj] of Object.entries(ports)) {
            let originalPortName = portName;
            portName = getPortName(isSlice, isConcat, portName, cellObj);
            let direction = getPortDirectionFn(portObj);
            this.createLPort(node, portName, originalPortName, direction, node.ports, portByName);
        }
        if (isConcat) {
            node.ports = node.ports.reverse();
            updatePortIndicesNoHierarchy(node.ports);
        }
    }

    loadLNodeChildrenFromYosysModule(node, hierarchyLevelLimit) {
        // iterate all cells and lookup for modules and construct them recursively
        for (const [cellName, cellObj] of Object.entries(this.yosysModule.cells)) {
            let moduleName = cellObj.type; //module name
            let cellModuleObj = this.yosysModules[moduleName];

            let nodeBuilder = new LNodeBuilder(cellName, cellModuleObj, this.idCounter, this.yosysModules,
                this.hierarchyLevel + 1, this.nodePortNames, this.portSuffixesAreEqual, this.nodeIdToBuilder,
                this.portIdToParentDict);
            let hierarchyLevelLimitIsUndef = typeof hierarchyLevelLimit === "undefined";
            let cellNode = nodeBuilder.build(hierarchyLevelLimitIsUndef ? undefined :
                hierarchyLevelLimit, undefined, true);
            let children = node.children || node._children;
            if (children === undefined) {
                node.children = [];
                children = node.children;
            }
            children.push(cellNode);

            this.nodeIdToBuilder[cellNode.id] = nodeBuilder;
            this.nodeIdToCell[cellNode.id] = cellObj;

            if (!cellModuleObj) {
                // if it is blackbox or archetype which does not have any yosys module object
                if (cellObj.port_directions === undefined) {
                    this.childrenWithoutPortArray.push([cellObj, cellNode]);
                    continue;
                }

                // icon must be translated in advance because the port may get special ordering info based on node name
                yosysTranslateIcon(cellNode, cellObj);
                this.loadLNodePortsFromYosysModule(cellNode, cellObj.port_directions, (p) => {
                    return p;
                }, cellObj);

            }
        }
    }

    loadLNodeEdgesFromYosysModule(node, lookupPortsUsingName) {
        let edgeTargetsDict = {};
        let edgeSourcesDict = {};
        let constNodeDict = {};
        let [edgeDict, edgeArray] = this.getEdgeDictFromPorts(
            node, constNodeDict, edgeTargetsDict, edgeSourcesDict, lookupPortsUsingName);
        let netnamesDict = getNetNamesDict(this.yosysModule);

        function getPortName(bit) {
            return netnamesDict[bit];
        }

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

            this.loadLNodeEdgesForYosysCell(node, child, cell, connections, constNodeDict, edgeDict, edgeArray,
                getPortName, edgeTargetsDict, edgeSourcesDict);
        }
        // source null and target null == direction is output
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
                        port = this.createLPort(child, portName, portName, direction, child.ports, portByName);
                    }

                    edgePoints.push([child.id, port.id]);
                }
            }
        }
    }

    loadLNodeEdgesForYosysCell(node, child, cell, connections, constNodeDict, edgeDict, edgeArray,
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

            this.translateYosysBitsToLEdges(node, child.id, portObj.id, bits, direction, edgeDict, constNodeDict,
                edgeArray, getPortName, getSourceAndTargetForCell, edgeTargetsDict, edgeSourcesDict);
        }

    }

    getEdgeDictFromPorts(node, constNodeDict, edgeTargetsDict, edgeSourcesDict, lookupPortsUsingName) {
        let edgeDict = {}; // yosys bits (netId): LEdge
        let edgeArray = [];
        let portsIndex = 0;
        for (const [portName, portObj] of Object.entries(this.yosysModule.ports)) {
            let port;
            if (lookupPortsUsingName) {
                port = this.nodePortNames[node.id][portName];
            } else {
                port = node.ports[portsIndex];
            }
            portsIndex++;

            function getPortName2() {
                return portName;
            }

            this.translateYosysBitsToLEdges(node, node.id, port.id, portObj.bits, portObj.direction,
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
    translateYosysBitsToLEdges(node, childId, portId, bits, direction, edgeDict, constNodeDict, edgeArray,
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
                edge = this.createLEdge(portName);
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
        [constSubNode, port] = this.addConstLNode(node, nodeName, constNodeDict);
        sources.push([constSubNode.id, port.id]);
        return i;
    }

    addConstLNode(node, nodeName, constNodeDict) {
        let port;
        let nodeBuilder = new LNodeBuilder(nodeName, undefined, this.idCounter, null,
            this.hierarchyLevel + 1, this.nodePortNames, this.portSuffixesAreEqual, this.nodeIdToBuilder,
            this.portIdToParentDict);
        let constNode = nodeBuilder.build(undefined, undefined, true, false);

        let portByName = this.nodePortNames[constNode.id] = {};
        port = this.createLPort(constNode, "O0", "O0", "output", constNode.ports, portByName);
        node.children.push(constNode);
        constNodeDict[constNode.id] = 1;

        return [constNode, port];
    }

}
