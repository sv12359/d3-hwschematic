import {getPortToEdgeDict} from "./yosysConcatAndSplitAggregation.js";

function getChildIdToParentDict(parent, ports, childIdToParentDict) {
    if (ports === undefined) {
        return;
    }
    for (let port of ports) {
        childIdToParentDict[port.id] = parent;

        getChildIdToParentDict(port, port.children, childIdToParentDict)
    }
}

function getRightId(leftId, edge, portIdToPortDict) {
    if (edge.sources.length !== 1 || edge.targets.length !== 1) {
        throw new Error("Sources or targets do not have length 1");
    }
    let sourceId = edge.sources[0][1]
    let targetId = edge.targets[0][1]


    if (sourceId === leftId) {
        return targetId;
    } else if (targetId === leftId) {
        return sourceId;
    }

    throw new Error("PortId was not found");
}

/**
 * If all children of the current port are connected to children which all have the same parent,
 * we remove these edges and replace them with a single edge between parents.
 */
function allPortsAreConnected(ports, portIdToEdgeDict, portIdToParentDict, portIdToPortDict, portSuffixesAreEqual) {
    if (ports.length === 0) {
        return null;
    }

    let leftParent;
    let rightParent;

    for (let port of ports) {
        let leftName = port.hwMeta.name;
        let edge = portIdToEdgeDict[port.id];
        if (edge === undefined) {
            return null;
        }

        let leftId = port.id;
        if (edge.sources.length !== 1 || edge.targets.length !== 1) {
            return null;
        }
        let sourceId = edge.sources[0][1]
        let targetId = edge.targets[0][1]

        let rightId;
        if (sourceId === leftId) {
            rightId = targetId;
        } else if (targetId === leftId) {
            rightId = sourceId;
        } else {
            throw new Error("PortId was not found");
        }

        //let rightId = getRightId(port.id, edge, portIdToPortDict);
        let rightName = portIdToPortDict[rightId].hwMeta.name;

        leftParent = portIdToParentDict[port.id];
        rightParent = portIdToParentDict[rightId];
        if (!leftParent) {
            throw new Error("leftParent of port undefined "+ port.id);
        }
        if (!rightParent) {
            throw new Error("rightParent of port undefined "+ rightId);
        }
        let leftParentName = leftParent.hwMeta.name;
        let rightParentName = rightParent.hwMeta.name;

        let leftSuffix = leftName.slice(leftParentName.length)
        let rightSuffix = rightName.slice(rightParentName.length)

        if (!portSuffixesAreEqual(leftSuffix, rightSuffix)) {
            return null;
        }
    }
    return rightParent;
}

function createAggregatedEdge(nodeBuilder, leftPort, rightPort, portIdToEdgeDict, portIdToPortDict, portIdToNodeIdDict) {
    let leftPortId = leftPort.id;
    let rightPortId = rightPort.id;

    let leftNodeId = portIdToNodeIdDict[leftPortId];
    let rightNodeId = portIdToNodeIdDict[rightPortId];
    if (typeof leftNodeId === "undefined" || typeof rightNodeId === "undefined") {
        throw new Error("Node id must be defined");
    }
    let newEdge = nodeBuilder.createLEdge(leftPort.hwMeta.name, leftPort);
    if (leftPort.direction === "INPUT") {
        newEdge.sources.push([leftNodeId, leftPortId]);
        newEdge.targets.push([rightNodeId, rightPortId]);
    } else if (leftPort.direction === "OUTPUT") {
        newEdge.sources.push([rightNodeId, rightPortId]);
        newEdge.targets.push([leftNodeId, leftPortId]);
    } else {
        throw new Error("Invalid direction: " + leftPort.direction);
    }

    portIdToEdgeDict[leftPortId] = newEdge;
    portIdToEdgeDict[rightPortId] = newEdge;
    return newEdge
}

function aggregateHierarchicalPortEdgesRec(parentNode, childNodeOrPort, nodeBuilder, ports, portIdToEdgeDict, portIdToParentDict,
                                           portIdToPortDict, portIdToNodeIdDict, edgesToDelete,
                                           portSuffixesAreEqual) {
    let edges = parentNode.edges || parentNode._edges;
    let isTopPort = parentNode.ports === ports;
    for (let port of ports) {
        aggregateHierarchicalPortEdgesRec(parentNode, childNodeOrPort, nodeBuilder, port.children, portIdToEdgeDict, portIdToParentDict,
            portIdToPortDict, portIdToNodeIdDict, edgesToDelete, portSuffixesAreEqual);
        if (!isTopPort) {
            // if this is port directly on node we can not aggregate it because aggregation works only for ports and not for nodes
            let otherPort = allPortsAreConnected(port.children, portIdToEdgeDict, portIdToParentDict, portIdToPortDict,
                portSuffixesAreEqual);
            if (otherPort !== null) {
                for (let childPort of port.children) {
                    edgesToDelete.add(portIdToEdgeDict[childPort.id].id);
                }
                let newEdge = createAggregatedEdge(nodeBuilder, port, otherPort, portIdToEdgeDict, portIdToPortDict,
                    portIdToNodeIdDict);
                edges.push(newEdge);
                parentNode.hwMeta.maxId = nodeBuilder.idCounter.id - 1;
            }
        }
    }
}

function getPortIdToPortDict(ports, portIdToPortDict) {
    if (ports === undefined) {
        return;
    }
    for (let port of ports) {
        portIdToPortDict[port.id] = port;
        let children = port.children || port._children;
        getPortIdToPortDict(children, portIdToPortDict);
    }

}

function getPortIdToNodeIdDict(nodeId, ports, portIdToNodeIdDict) {
    if (ports === undefined) {
        return;
    }
    for (let port of ports) {
        portIdToNodeIdDict[port.id] = nodeId;
        let children = port.children || port._children;
        getPortIdToNodeIdDict(nodeId, children, portIdToNodeIdDict);
    }
}

// aggregates edges of hierarchical ports (ports already have to be aggregated)
export function aggregateHierarchicalPortEdges(nodeBuilder, parentNode, portSuffixesAreEqual, portIdToParentDict) {
    let edges = parentNode.edges || parentNode._edges;
    let children = parentNode.children || parentNode._children;
    if (edges === undefined || children === undefined) {
        return;
    }
    let portIdToPortDict = {};
    let portIdToNodeIdDict = {};
    let edgesToDelete = new Set();

    let portIdToEdgeDict = getPortToEdgeDict(edges);
    getPortIdToPortDict(parentNode.ports, portIdToPortDict);
    getPortIdToNodeIdDict(parentNode.id, parentNode.ports, portIdToNodeIdDict);
    for (let child of children) {
        getPortIdToPortDict(child.ports, portIdToPortDict);
        getPortIdToNodeIdDict(child.id, child.ports, portIdToNodeIdDict);
    }

    for (let child of children) {
        aggregateHierarchicalPortEdgesRec(parentNode, child, nodeBuilder, child.ports, portIdToEdgeDict, portIdToParentDict,
            portIdToPortDict, portIdToNodeIdDict, edgesToDelete,
            portSuffixesAreEqual);

    }

    if (parentNode.edges !== undefined) {
        parentNode.edges = parentNode.edges.filter((e) => {
            return !edgesToDelete.has(e.id);
        });
    } else {
        parentNode._edges = parentNode._edges.filter((e) => {
            return !edgesToDelete.has(e.id);
        });
    }

}
