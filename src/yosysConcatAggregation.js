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
function aggregateTwoNodes(childSourcePorts, targetNode, targetPort, portIdToEdgeDict) {
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

function aggregate(node, childrenConcats, portIdToEdgeDict, portIdToPortDict, nodeIdToNodeDict) {
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
                aggregateTwoNodes(childSourcePorts, targetNode, targetPort, portIdToEdgeDict)
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

export function aggregateConcants(node) {
    let concats = fillConcats(node.children);
    let portIdToEdgeDict = getPortToEdgeDict(node.edges);
    let portIdToPortDict = getPortIdToPortDict(node);
    let nodeIdToNodeDict = getNodeIdToNodeDict(node);
    aggregate(node, concats, portIdToEdgeDict, portIdToPortDict, nodeIdToNodeDict);
}