
function isDuplicit(node, idDict) {
    if (typeof node.id !== "string") {
        throw new Error ("LNode id must be string: " + node.id);
    }
    if (idDict[node.id] === undefined)
    {
        idDict[node.id] = node;
    } else {
        throw new Error(("Duplicit id detected: " + node.id + ": " + node.hwMeta.name + " and "  + node.id + ": " + idDict[node.id].hwMeta.name));
    }
}
export function checkIdDuplicities(node, idDict, checkPortChildren) {
    isDuplicit(node, idDict);
    let children = node.children || node._children
    if (children !== undefined) {
        for (let child of children) {
            checkIdDuplicities(child, idDict, checkPortChildren);
        }
    }
    let edges = node.edges || node._edges;
    if (edges !== undefined) {
        for (let edge of edges) {
            checkIdDuplicities(edge, idDict, checkPortChildren)
        }
    }

    let ports = node.ports || node._ports;
    if (ports !== undefined) {
        for (let port of ports) {
            if (checkPortChildren) {
                checkIdDuplicities(port, idDict, checkPortChildren);
            } else {
                isDuplicit(port, idDict);
            }
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

export function checkMaxId(node) {
    if (typeof (node.hwMeta.maxId) !== "number") {
        throw new Error("checkMaxId: maxId is not a number")
    }
    let maxId = parseInt(node.hwMeta.maxId);
    let children = node.children || node._children
    if (children !== undefined) {
        for (let child of children) {
            checkMaxId(child);
            if (maxId < parseInt(child.hwMeta.maxId)) {
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
