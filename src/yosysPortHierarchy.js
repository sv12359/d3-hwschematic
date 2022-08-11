import {convertPortOrderingFromYosysToElk} from "./yosysUtills.js";

function createPortHierarchy(nodeBuilder, node, portsAggregatedByPrefix, newPortList, portByName) {
    if (!portsAggregatedByPrefix.hasMultipleChildren()) {
        newPortList.push(portsAggregatedByPrefix.getAnyChildren());
        return;
    }
    if (portsAggregatedByPrefix.namePrefix !== "") {
        // add header of a port group if required
        let direction = portsAggregatedByPrefix.getMajorityDirection().toLowerCase();
        let portGroupHeaderPort = nodeBuilder.makeLPort(newPortList, portByName,
            portsAggregatedByPrefix.namePrefix, portsAggregatedByPrefix.namePrefix, direction, node.name);
        newPortList = portGroupHeaderPort.children;
    }
    for (let port of portsAggregatedByPrefix.children) {
        newPortList.push(port);
    }
    for (let [_, nameDictNode] of Object.entries(portsAggregatedByPrefix.nestedChildren)) {
        createPortHierarchy(nodeBuilder, node, nameDictNode, newPortList, portByName);
    }
}

class NameDictNode {
    constructor(namePrefix) {
        this.namePrefix = namePrefix;
        this.children = []; // list of ports directly on this hierarchy level
        this.nestedChildren = {}; // dictionary {prefix: NameDictNode}
    }

    getForPrefix(name) {
        let c = this.nestedChildren[name];
        if (c === undefined) {
            let absoluteName = name;
            if (this.namePrefix.length !== 0) {
                absoluteName = this.namePrefix + "_" + name;
            }
            c = new NameDictNode(absoluteName);
            this.nestedChildren[name] = c;
        }
        return c;
    }

    getAnyChildren() {
        if (this.children.length !== 0) {
            return this.children[0];
        } else {
            for (let [_, subNode] of Object.entries(this.nestedChildren)) {
                return subNode.getAnyChildren();
            }
        }
    }

    hasMultipleChildren() {
        if (this.children.length > 1) {
            return true;
        } else {
            let nestedChildren = Object.entries(this.nestedChildren);
            if (this.children.length === 1) {
                return nestedChildren.length > 0;
            }
            // children.length === 0
            if (nestedChildren.length > 1)
                return true;
            // at this point there is max 1 item in nestedChildren
            for (let [_, subNode] of nestedChildren) {
                return subNode.hasMultipleChildren();
            }
            return false;
        }
    }

    static fillDirectionDictFromNestedChildren(nestedChildren, directionDict) {
        for (let [_, nameNodeDict] of Object.entries(nestedChildren)) {
            let direction = nameNodeDict.getMajorityDirection(directionDict);
            directionDict[direction] += 1;
        }
    }

    static fillDirectionDictFromChildren(children, directionDict) {
        for (let child of children) {
            directionDict[child.direction] += 1;
        }
    }

    getMajorityDirection() {
        let directionDict = {"INPUT": 0, "OUTPUT": 0};
        NameDictNode.fillDirectionDictFromChildren(this.children, directionDict);
        NameDictNode.fillDirectionDictFromNestedChildren(this.nestedChildren, directionDict);

        let input = directionDict["INPUT"];
        let output = directionDict["OUTPUT"];

        if (output > input) {
            return "OUTPUT"
        } else if (output < input) {
            return "INPUT"
        } else {
            return this.getAnyChildren().direction;
        }
    }
}

function getPortStartNameToPorts(ports) {
    let root = new NameDictNode("");
    for (let port of ports) {
        let names = port.hwMeta.name.split("_");
        let level = 0;
        let d = root;
        if (names.length === 1) {
            continue;
        }
        for (let name of names) {
            if (level === names.length - 1) {
                d.children.push(port);
            } else {
                d = d.getForPrefix(name);
            }
            ++level;
        }
    }
    for (let port of ports) {
        let name = port.hwMeta.name;
        if (name.search("_") === -1) {
            let portGroup = root.nestedChildren[name];
            if (portGroup === undefined) {
                root.children.push(port);
            } else {
                portGroup.children.push(port);
            }
        }
    }

    return root;
}

function setPortSidesRec(port, side) {
    port.properties.side = side;
    for (let child of port.children) {
        setPortSidesRec(child, side);
    }
}

function fillPortSideDict(ports, portSideDict) {
    for (let port of ports) {
        let side = port.properties.side;
        portSideDict[side] += 1;
        fillPortSideDict(port.children, portSideDict);
    }
}

function isMax(potentialMax, valueList) {
    for (let value of valueList) {
        if (potentialMax <= value) {
            return false
        }
    }
    return true;
}

function getMaxOfPortSideDict(portSideDict, defaultSide) {
    let north = portSideDict["NORTH"]
    let east = portSideDict["EAST"]
    let south = portSideDict["SOUTH"]
    let west = portSideDict["WEST"]
    if (isMax(north, [east, south, west])) {
        return "NORTH"
    } else if (isMax(east, [north, south, west])) {
        return "EAST"

    } else if (isMax(south, [north, east, west])) {
        return "SOUTH"

    } else if (isMax(west, [north, east, south])) {
        return "WEST"
    }

    return defaultSide;
}

function getMajoritySide(port) {
    let portSideDict = {"NORTH": 0, "EAST": 0, "WEST": 0, "SOUTH": 0};
    fillPortSideDict(port.children, portSideDict);
    return getMaxOfPortSideDict(portSideDict, port.properties.side);
}
function setPortSides(ports) {
    for (let port of ports) {
        let side = getMajoritySide(port);
        setPortSidesRec(port, side);
    }
}

export function setPortHierarchy(nodeBuilder, node, portByName) {

    if (node.ports.length > 1) {
        let portsAggregatedByPrefix = getPortStartNameToPorts(node.ports);
        let newPortList = [];
        createPortHierarchy(nodeBuilder, node, portsAggregatedByPrefix, newPortList, portByName);
        node.ports = newPortList;
        setPortSides(node.ports);

        convertPortOrderingFromYosysToElk(node);
    }


}
