export function getPortSide(portName, direction, nodeName) {
    if (direction === "input" && nodeName === "MUX" && portName === "S") {
        return "SOUTH";
    }
    if (direction === "output") {
        return "EAST";
    }
    if (direction === "input") {
        return "WEST";
    }
    throw new Error("Unknown direction " + direction);
}

function orderPorts(node) {
    let index = 0;
    for (let port of node.ports) {
        let dstIndex = index;
        if (port.hwMeta.name === "CLK") {
            dstIndex = node.ports.length - 1;
        } else if (port.hwMeta.name === "ARST") {
            dstIndex = node.ports.length - 2;
        }
        if (index !== dstIndex) {
            let otherPort = node.ports[dstIndex];
            node.ports[dstIndex] = port;
            node.ports[index] = otherPort;
            otherPort.properties.index = port.properties.index;
            port.properties.index = dstIndex;
        }
        ++index;
    }
}

export function orderClkAndRstPorts(child) {
    if (child.hwMeta.cls === "Operator" && child.hwMeta.name.startsWith("FF")) {
        orderPorts(child);
    }
}

function iterNetnameBits(netnames, fn) {
    for (const [netname, netObj] of Object.entries(netnames)) {
        for (const bit of netObj.bits) {
            fn(netname, bit, Number.isInteger(bit), isConst(bit));
        }
    }
}

export function getNetNamesDict(yosysModule) {
    let netnamesDict = {}; // yosys bits (netId): netname

    iterNetnameBits(yosysModule.netnames, (netname, bit, isInt, isStr) => {
        if (isInt) {
            netnamesDict[bit] = netname;
        } else if (!isStr) {
            throw new Error("Invalid type in bits: " + typeof bit);
        }
    });
    return netnamesDict;
}

export function isConst(val) {
    return (typeof val === "string");
}

export function getConstNodeName(nameArray) {
    let nodeName = nameArray.reverse().join("");
    nodeName = ["0b", nodeName].join("");
    if (nodeName.match(/^0b[01]+$/g)) {
        let res = BigInt(nodeName).toString(16);
        return ["0x", res].join("");
    }
    return nodeName;
}

export function addEdge(edge, portId, edgeDict, startIndex, width) {
    let edgeArr = edgeDict[portId];
    if (edgeArr === undefined) {
        edgeArr = edgeDict[portId] = [];
    }
    edgeArr[startIndex] = [edge, width];
}

export function getSourceAndTarget2(edge) {
    return [edge.sources, edge.targets, false, true];
}

export function getSourceAndTargetForCell(edge) {
    return [edge.targets, edge.sources, true, false];
}

export function getPortNameSplice(startIndex, width) {
    if (width === 1) {
        return `[${startIndex}]`;
    } else if (width > 1) {
        let endIndex = startIndex + width;
        return `[${endIndex}:${startIndex}]`;
    }

    throw new Error("Incorrect width" + width);

}


export function updatePortIndices(ports, index) {
    for (let port of ports) {
        let side = port.properties.side;
        if (side === "SOUTH" || side === "WEST") {
            index = updatePortIndices(port.children, index);
            port.properties.index = index;
            ++index;
        } else if (side === "NORTH" || side === "EAST") {
            port.properties.index = index;
            ++index;
            index = updatePortIndices(port.children, index);
        } else {
            throw new Error("Invalid side" + side)
        }
    }

    return index;
}

export function updatePortIndicesNoHierarchy(ports) {
    let index = 0;
    for (let port of ports) {
        port.properties.index = index;
        ++index;
    }
}

function dividePorts(ports) {
    let north = [];
    let east = [];
    let south = [];
    let west = [];

    for (let port of ports) {
        let side = port.properties.side;
        if (side === "NORTH") {
            north.push(port);
        } else if (side === "EAST") {
            east.push(port);
        } else if (side === "SOUTH") {
            south.push(port);
        } else if (side === "WEST") {
            west.push(port);
        } else {
            throw new Error("Invalid port side: " + side);
        }
    }

    return [north, east, south, west];
}

export function convertPortOrderingFromYosysToElk(node) {
    let [north, east, south, west] = dividePorts(node.ports);
    node.ports = north.concat(east, south.reverse(), west.reverse());
    updatePortIndices(node.ports, 0);
}

export function getTopModule(yosysJson) {
    for (const [moduleName, moduleObj] of Object.entries(yosysJson.modules)) {
        if (moduleObj.attributes.top) {
            return [moduleName, moduleObj];
        }
    }
    throw new Error("Cannot find top");
}


export function elkGetModuleByPath(rootNode, path) {
    let children = rootNode.children
    let output = rootNode;
    let objectPath = [output];
    for (let nodeName of path) {
        for (let child of children) {
            if (child.hwMeta.name === nodeName) {
                output = child;
                objectPath.push(output);
                children = child.children || child._children;
                break;
            }
        }
    }

    return [output, objectPath];
}

/**
 * @returns null if cellObj is does not have a module in yosys modules
 */
export function yosysGetModuleByPath(yosysJson, path) {
    let topModuleName;
    let topModuleObj = null;
    for (let nodeName of path) {
        if (topModuleObj === null) {
            // start of the search at top
            [topModuleName, topModuleObj] = getTopModule(yosysJson);
            continue;
        }
        let cellObj = topModuleObj.cells[nodeName];
        if (typeof cellObj === "undefined") {
            return [null, null];
        }

        let type = cellObj.type;
        topModuleName = nodeName;
        topModuleObj = yosysJson.modules[type];
    }

    return [topModuleName, topModuleObj];

}

export function hideNodeObjects(node, hierarchyLevel) {
    node._children = node.children;
    delete node.children
    node._edges = node.edges;
    delete node.edges;
}

export function getPortName(isSlice, isConcat, portName, cellObj) {
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