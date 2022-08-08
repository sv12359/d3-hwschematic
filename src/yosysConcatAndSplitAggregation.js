import {updatePortIndices} from "./yosysUtills.js"

function getNodePorts(node, dict){
    for (let port of node.ports) {
        dict[port.id] = port;
    }

}
function getPortIdToPortDict(node) {
    let PortIdToPortDict = {};

    getNodePorts(node, PortIdToPortDict);
    for (let child of node.children) {
        getNodePorts(child, PortIdToPortDict);
    }

    return PortIdToPortDict;
}
function getNodeIdToNodeDict(node,) {
    let nodeIdToNodeDict = {};
    nodeIdToNodeDict[node.id] = node;
    for (let child of node.children) {
        nodeIdToNodeDict[child.id] = child;
    }
    return nodeIdToNodeDict;
}

function getPortToEdgeDict(edges) {
    let portToEdgeDict = {};
    for (let edge of edges) {
        let targets = edge.targets;
        let sources = edge.sources;
        for (let [_, portId] of sources) {
            portToEdgeDict[portId] = edge;
        }

        for (let [_, portId] of targets) {
            portToEdgeDict[portId] = edge;
        }
    }
    return portToEdgeDict;
}

function getChildSourcePorts(ports) {
    let sourcePorts = [];
    for(let port of ports) {
        if (port !== undefined && port.direction === "INPUT") {
            sourcePorts.push(port);
        }
    }

    return sourcePorts;
}

function getEdgeTargetsIndex(targets, portId) {
    for(let i = 0; i < targets.length; ++i) {
        let target = targets[i];
        let [_, targetPortId] = target;

        if (portId === targetPortId) {
            return i;
        }
    }
    throw new Error("PortId was not found");

}
function aggregateTwoConcats(childSourcePorts, targetNode, targetPort, portIdToEdgeDict) {
    let i = 0;
    if (targetPort.properties.index !== 0) {
        throw new Error("Port index is not zero, need to regenerate indices in port labels");
    }
    for (let oldTargetPort of childSourcePorts) {
        let oldTargetPortId = oldTargetPort.id;
        let edge = portIdToEdgeDict[oldTargetPortId];
        let edgeTargetsIndex = getEdgeTargetsIndex(edge.targets, oldTargetPortId);
        edge.targets[edgeTargetsIndex][0] = targetNode.id;
        let newTargetPortIndex = targetPort.properties.index + i;
        if (i === 0) {
            targetNode.ports[newTargetPortIndex] = oldTargetPort;
        }
        else {
            targetNode.ports.splice(newTargetPortIndex, 0, oldTargetPort)
        }
        oldTargetPort.properties.index = newTargetPortIndex;
        ++i;
    }


}

function getChildTargetPortId(child) {
    for (let port of child.ports) {
        if (port !== undefined && port.direction === "OUTPUT")
        {
            return port.id;
        }
    }

    throw new Error("Concat child has no target");
}

function aggregateConcats(node, childrenConcats, portIdToEdgeDict, portIdToPortDict, nodeIdToNodeDict) {
    let edgesToDelete = new Set();
    let childrenToDelete = new Set();

    for (let child of childrenConcats) {
        let childTargetPortId = getChildTargetPortId(child);
        let edge = portIdToEdgeDict[childTargetPortId];
        if (edge === undefined) {
            continue;
        }
        let targets = edge.targets;

        if (targets !== undefined && targets.length === 1) {
            let [nodeId, portId] = targets[0];
            let targetNode = nodeIdToNodeDict[nodeId];
            let targetPort = portIdToPortDict[portId];
            let childSourcePorts = getChildSourcePorts(child.ports);
            if (targetNode === undefined) {
                throw new Error("Target node of target port is undefined");
            }
            if (targetNode.hwMeta.cls === "Operator" && targetNode.hwMeta.name === "CONCAT") {
                aggregateTwoConcats(childSourcePorts, targetNode, targetPort, portIdToEdgeDict)
                edgesToDelete.add(edge.id);
                childrenToDelete.add(child.id);
            }
        }
    }
    node.children = node.children.filter((c) => {
        return !childrenToDelete.has(c.id);
    });
    node.edges = node.edges.filter((e) => {
        return !edgesToDelete.has(e.id);
    });
}

function fillConcats(children) {
    let concats = [];
    for (let child of children) {
        if (child.hwMeta.cls === "Operator" && child.hwMeta.name === "CONCAT") {
            concats.push(child);
        }
    }
    return concats;

}

function aggregateTwoSplits(innitialNode, oldNode, portIdToEdgeDict) {
    let oldNodePort = oldNode.ports[1]
    innitialNode.ports.push(oldNodePort);
    let edgeOnSplitOutput = portIdToEdgeDict[oldNodePort.id];
    edgeOnSplitOutput.sources[0][0] = innitialNode.id;
    oldNode.ports = [];
}



function filterTargets(edge, nodeIdToNodeDict, innitialNodeId) {
    let targets = [];
    for (let [targetNodeId, targetPortId] of edge.targets) {
        let targetNode = nodeIdToNodeDict[targetNodeId];
        if (targetNode.id === innitialNodeId || targetNode.hwMeta.cls !== "Operator" || targetNode.hwMeta.name !== "SLICE") {
            targets.push([targetNodeId, targetPortId]);
        }
    }
    edge.targets = targets;

}
function aggregateEdgeTargets(parent, edge, targets, nodeIdToNodeDict, portIdToEdgeDict) {
    let innitialNode = undefined;
    let nodesToDelete = new Set();
    for (let [nodeId, _] of targets) {
        let node = nodeIdToNodeDict[nodeId]
        if (node.hwMeta.cls === "Operator" && node.hwMeta.name === "SLICE") {
            if (innitialNode === undefined) {
                innitialNode = node;
            }
            else {
                aggregateTwoSplits(innitialNode, node, portIdToEdgeDict);
                nodesToDelete.add(node.id);
            }
        }

    }
    if (innitialNode !== undefined) {
        updatePortIndices(innitialNode.ports);
        filterTargets(edge, nodeIdToNodeDict, innitialNode.id);

    }


    parent.children = parent.children.filter((c) => {
        return !nodesToDelete.has(c.id);
    });
}

function aggregateSplits(node, nodeIdToNodeDict, portIdToEdgeDict) {
    for (let edge of node.edges) {
        if (edge === undefined) {
            throw new Error("Edge is undefined");
        }
        let targets = edge.targets;
        aggregateEdgeTargets(node, edge, targets, nodeIdToNodeDict, portIdToEdgeDict);

    }
}
export function aggregateConcantsAndSplits(node) {
    let concats = fillConcats(node.children);
    let portIdToEdgeDict = getPortToEdgeDict(node.edges);
    let portIdToPortDict = getPortIdToPortDict(node);
    let nodeIdToNodeDict = getNodeIdToNodeDict(node);
    aggregateConcats(node, concats, portIdToEdgeDict, portIdToPortDict, nodeIdToNodeDict);
    aggregateSplits(node, nodeIdToNodeDict, portIdToEdgeDict);
}