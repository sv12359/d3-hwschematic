import {convertPortOrderingFromYosysToElk, updatePortIndices} from "./yosysUtills.js";

function createPortHierarchy(nodeBuilder, node, portsAggregatedByPrefix, newPortList, portByName) {
    if (!portsAggregatedByPrefix.hasMultipleChildren()) {
        newPortList.push(portsAggregatedByPrefix.getAnyChildren());
        //console.log("1: " + portsAggregatedByPrefix.getAnyChildren().hwMeta.name);
        return;
    }
    if (portsAggregatedByPrefix.namePrefix !== "") {
        // add header of a port group if required

        let direction = portsAggregatedByPrefix.getAnyChildren().direction.toLowerCase();
        let portGroupHeaderPort = nodeBuilder.makeLPort(newPortList, portByName,
            portsAggregatedByPrefix.namePrefix, portsAggregatedByPrefix.namePrefix, direction, node.name);
        newPortList = portGroupHeaderPort.children;
    }
    for (let port of portsAggregatedByPrefix.children) {
        newPortList.push(port);
        //console.log("2: " + port.hwMeta.name);
    }
    for (let [prefix, nameDictNode] of Object.entries(portsAggregatedByPrefix.nestedChildren)) {
        createPortHierarchy(nodeBuilder, node, nameDictNode, newPortList, portByName);
    }
}

/*
function getPortStartNameToPorts_(ports) {
    let portPrefixToPortsDict = {};
    for (let port of ports) {
        let name = port.hwMeta.name.split("_")[0];
        if (portPrefixToPortsDict[name] === undefined) {
            portPrefixToPortsDict[name] = [port];
        } else {
            portPrefixToPortsDict[name].push(port);
        }
    }

    return portPrefixToPortsDict;
}
*/
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

function setPortSideRec(ports, side) {
    for (let port of ports) {
        port.properties.side = side;
        setPortSideRec(port.children, side);
    }
}

function setPortSide(ports) {
    for (let port of ports) {
        let side = port.properties.side;
        setPortSideRec(port.children, side);
    }
}

export function setPortHierarchy(nodeBuilder, node, portByName) {

    if (node.ports.length > 1) {
        let portsAggregatedByPrefix = getPortStartNameToPorts(node.ports);
        let newPortList = [];
        createPortHierarchy(nodeBuilder, node, portsAggregatedByPrefix, newPortList, portByName);
        node.ports = newPortList;
        setPortSide(node.ports);

        convertPortOrderingFromYosysToElk(node);
    }


}
