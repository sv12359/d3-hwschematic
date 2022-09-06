import {
    getTopModule,
} from "./yosysUtills.js";
import {IdCounter, LNodeBuilder} from "./yosysLNodeBuilder.js"
import {collectPortIdToParentObjDict, discoverPortHierarchy} from "./yosysPortHierarchy.js";
import {aggregateHierarchicalPortEdges} from "./yosysHierarchicalPortEdges.js";

export function fromYosys(yosysJson, hierarchyLevelLimit, portSuffixesAreEqual) {
    //TODO: when choosing the same node repeatedly from Root path, ports are possibly duplicated, also happens when chosing
    //        any other node
    //TODO: Root path: add inteliscence from yosys json
    //TODO: blackboxes tests variants:
    //      blackbox to blackbox
    //      blackbox to sibling
    //      blackbox to parent
    //      edges have muliple targets(one target is a blackbox)
    //TODO: mouse wheel click on a node(select the root)
    //TODO: thicker edges
    //TODO: show portname when mouse is hovered above it
    //TODO: port graphics: port hierarchy
    //TODO: double edge bug (riscv_top u_icache)

    let nodePortNames = {}; // :see: :class:`~.LNodeBuilder`
    let idCounter = new IdCounter();
    let rootNodeBuilder = new LNodeBuilder("root", null, idCounter, null,
        0, nodePortNames, portSuffixesAreEqual, {}, {});
    rootNodeBuilder.nodeIdToBuilder["0"] = rootNodeBuilder;
    let hierarchyLevelLimitIsUndef = typeof hierarchyLevelLimit === "undefined";
    let childHierarchyLimit = hierarchyLevelLimitIsUndef ? undefined : hierarchyLevelLimit;
    let rootNode = rootNodeBuilder.build(childHierarchyLimit, undefined, true, false);

    let [topModuleName, topModuleObj] = getTopModule(yosysJson);
    let mainNodeBuilder = new LNodeBuilder(topModuleName,
        topModuleObj,
        idCounter,
        yosysJson.modules,
        rootNodeBuilder.hierarchyLevel + 1,
        nodePortNames,
        portSuffixesAreEqual,
        rootNodeBuilder.nodeIdToBuilder,
        rootNodeBuilder.portIdToParentDict);
    let mainComponentNode = mainNodeBuilder.build(hierarchyLevelLimit, undefined, true,
        undefined, false);
    // because mainComponentNode node is never treated as a child on which the aggregation is executed

    discoverPortHierarchy(mainNodeBuilder, mainComponentNode, mainNodeBuilder.nodePortNames[mainComponentNode.id]);
    for (const p of mainComponentNode.ports) {
        collectPortIdToParentObjDict(mainComponentNode, p, mainNodeBuilder.portIdToParentDict);
    }
    aggregateHierarchicalPortEdges(mainNodeBuilder, mainComponentNode, mainNodeBuilder.portSuffixesAreEqual, mainNodeBuilder.portIdToParentDict);

    let children = rootNode.children || rootNode._children;
    if (children === undefined) {
        rootNode.edges = [];
        rootNode.children = [];
        children = rootNode.children;
    }
    children.push(mainComponentNode);

    //print output to console
    //console.log(JSON.stringify(output, null, 2));

    let childNodeBuilder = rootNodeBuilder.nodeIdToBuilder[rootNode.children[0].id];
    rootNode.hwMeta.maxId = childNodeBuilder.idCounter.id - 1;

    return [rootNode, rootNodeBuilder];
}

export function fromYosysForSingleNodeWithExistingRoot(currentNode, yosysJson, topModuleName, topModuleObj, hierarchyLevelLimit,
                                                       idCounter, nodePortNames,
                                                       portSuffixesAreEqual, rootNodeBuilder, nodeBuilder) {
    // build main component node
    if (typeof currentNode.edges === "undefined" && typeof currentNode._edges === "undefined") {
        currentNode.edges = [];
    }

    if (typeof currentNode.children === "undefined" && typeof currentNode._children === "undefined") {
        currentNode.children = [];
    }
    nodeBuilder.build(hierarchyLevelLimit, currentNode, false, true);
}
