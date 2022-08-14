
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
function allPortsAreConnected(ports, portIdToEdgeDict, childIdToParentDict, portIdToPortDict, leftPortIdToRightPortIdDict, portSuffixesAreEqual){
    if (ports.length === 0) {
        return false;
    }

    let leftParent;
    let rightParent;
    for (let port of ports) {

        let leftName = port.hwMeta.name;

        let edge = portIdToEdgeDict[port.id];
        if (edge === undefined) {
            return false
        }

        let leftId = port.id;
        if (edge.sources.length !== 1 || edge.targets.length !== 1) {
            return false;
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

        leftParent = childIdToParentDict[port.id];
        rightParent = childIdToParentDict[rightId];
        let leftParentName = leftParent.hwMeta.name;
        let rightParentName = rightParent.hwMeta.name;
        let leftSuffix = leftName.slice(leftParentName.length)
        let rightSuffix = rightName.slice(rightParentName.length)

        if (!portSuffixesAreEqual(leftSuffix, rightSuffix)) {
            return false
        }


    }
    leftPortIdToRightPortIdDict[leftParent.id] = rightParent.id;
    return true;

}

function getNodeIds(leftPortId, edge) {
    let sourceNodeId = edge.sources[0][0];
    let sourcePortId = edge.sources[0][1];
    let targetNodeId = edge.targets[0][0];
    let targetPortId = edge.targets[0][1];

    if (leftPortId === sourcePortId) {
        return [sourceNodeId, targetNodeId]
    } else if (leftPortId === targetPortId) {
        return [targetNodeId, sourceNodeId]
    }

    throw new Error("Invalid port id");



}
function createAggregatedEdge(parent, child, nodeBuilder, leftPort, portIdToEdgeDict, portIdToPortDict, childIdToParentDict, leftPortIdToRightPortIdDict, portIdToNodeIdDict) {
    let leftPortId = leftPort.id;
    let rightPortId = leftPortIdToRightPortIdDict[leftPortId];

    let leftNodeId = portIdToNodeIdDict[leftPortId];
    let rightNodeId = portIdToNodeIdDict[rightPortId];

    let newEdge = nodeBuilder.makeLEdge(leftPort.hwMeta.name, leftPort);
    if (leftPort.direction === "INPUT") {
        newEdge.sources.push([leftNodeId, leftPortId]);
        newEdge.targets.push([rightNodeId, rightPortId]);
    } else if (leftPort.direction === "OUTPUT") {
        newEdge.sources.push([rightNodeId, rightPortId]);
        newEdge.targets.push([leftNodeId, leftPortId]);
    } else {
        throw new Error ("Invalid direction: " + leftPort.direction);
    }
    let edges = parent.edges || parent._edges;
    edges.push(newEdge);
    parent.hwMeta.maxId = nodeBuilder.idCounter - 1;


    portIdToEdgeDict[leftPortId] = newEdge;
    portIdToEdgeDict[rightPortId] = newEdge;




}
function aggregateHierarchicalPortEdgesRec(parent, child, nodeBuilder, ports, portIdToEdgeDict, childIdToParentDict, portIdToPortDict, leftPortIdToRightPortIdDict, portIdToNodeIdDict, edgesToDelete, portSuffixesAreEqual) {
    for (let port of ports) {
        aggregateHierarchicalPortEdgesRec(parent, child, nodeBuilder, port.children, portIdToEdgeDict, childIdToParentDict, portIdToPortDict, leftPortIdToRightPortIdDict, portIdToNodeIdDict, edgesToDelete, portSuffixesAreEqual);
        if (allPortsAreConnected(port.children, portIdToEdgeDict, childIdToParentDict, portIdToPortDict, leftPortIdToRightPortIdDict, portSuffixesAreEqual)) {
            for (let childPort of port.children) {
                edgesToDelete.add(portIdToEdgeDict[childPort.id].id);
            }
            createAggregatedEdge(parent, child, nodeBuilder, port, portIdToEdgeDict, portIdToPortDict, childIdToParentDict, leftPortIdToRightPortIdDict, portIdToNodeIdDict);

        }
    }
}

function getPortIdToPortDict_(ports, portIdToPortDict) {
    if (ports === undefined) {
        return;
    }
    for (let port of ports) {
        portIdToPortDict[port.id] = port;
        let children = port.children || port._children;
        getPortIdToPortDict_(children, portIdToPortDict);
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
export function aggregateHierarchicalPortEdges(nodeBuilder, parent, portSuffixesAreEqual) {
    let edges = parent.edges || parent._edges;
    let children = parent.children || parent._children;
    if (edges === undefined || children === undefined) {
        return;
    }
    let childIdToParentDict = {};
    let portIdToPortDict = {};
    let portIdToNodeIdDict = {};
    let edgesToDelete = new Set();

    let portIdToEdgeDict = getPortToEdgeDict(edges);
    getChildIdToParentDict(parent, parent.ports, childIdToParentDict);
    getPortIdToPortDict_(parent.ports, portIdToPortDict);
    getPortIdToNodeIdDict(parent.id, parent.ports, portIdToNodeIdDict);
    for (let child of children) {
        getChildIdToParentDict(child, child.ports, childIdToParentDict);
        getPortIdToPortDict_(child.ports, portIdToPortDict);
        getPortIdToNodeIdDict(child.id, child.ports, portIdToNodeIdDict);
    }
    for (let child of children) {
        aggregateHierarchicalPortEdgesRec(parent, child, nodeBuilder, child.ports, portIdToEdgeDict, childIdToParentDict, portIdToPortDict, {}, portIdToNodeIdDict, edgesToDelete, portSuffixesAreEqual);

    }

    if (parent.edges !== undefined) {
        parent.edges = parent.edges.filter((e) => {
            return !edgesToDelete.has(e.id);
        });
    } else {
        parent._edges = parent._edges.filter((e) => {
            return !edgesToDelete.has(e.id);
        });
    }

}
