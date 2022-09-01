"use strict";

import * as d3 from "d3";
import HwSchematic from '../src/d3-hwschematic';
import {simulateEvent} from './simulateEvent.js';

import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import {checkMaxId, detectDuplicitIds} from "./objectIdTestFunctions.js";

const EXAMPLES = __dirname + "/../examples/schemes"
const YOSYS_EXAMPLES = __dirname + "/../examples/schemes_yosys"


function initSvg() {
	let svg = d3.select("body")
		.append("svg");

	svg.attr("width", 500)
		.attr("height", 500);

	return svg;
}

jest.setTimeout(10000);


describe('Testing scheme rendering', () => {
	it("SVG has root g and markers", function() {
		let svg = initSvg();
		let sch = new HwSchematic(svg);
		let gs = svg.selectAll("g");
		expect(gs.size()).toBe(8 + 1); // markers + zoom
		sch.terminate();
	});

	let exampleFiles = glob.sync(EXAMPLES + "/*.json");
	it("can find examples in " + EXAMPLES, () => {
		expect(exampleFiles.length).toBeGreaterThan(0);
	});
	//exampleFiles = [exampleFiles[0],]
	let applyLayoutSpy = jest.spyOn(HwSchematic.prototype, "_applyLayout");

	exampleFiles.forEach(function(f) {
		it("can render " + path.basename(f), () => {
			applyLayoutSpy.mockClear();
			let svg = initSvg();
			let sch = new HwSchematic(svg);
			let graphData = JSON.parse(fs.readFileSync(f));
			expect(graphData).not.toBeNull();
			return sch.bindData(graphData).then(
				() => {
					expect(applyLayoutSpy).toBeCalled();
					sch.terminate();
				},
				(reason) => {
					throw reason;
				}
			);
		});
	});

});



test('Testing component expansion', () => {
	let svg = initSvg();
	let sch = new HwSchematic(svg);
	let graphData = JSON.parse(fs.readFileSync(EXAMPLES + "/ClkDiv3.json"));

	return sch.bindData(graphData).then(
		() => {
			let nodesDef = svg.selectAll(".node");
			let procNode = nodesDef.filter((d) => {
				return d.id === "1";
			});
			expect(procNode.nodes().length).toBe(1);
			let d = procNode.data()[0];
			expect(d.hwMeta.cls).toBe("Process");
			expect(d._children).toBeDefined();
			expect(d.children).toBeUndefined();
			expect(d._edges).toBeDefined();
			expect(d.edges).toBeUndefined();

			simulateEvent(procNode.node(), 'click', {});
			expect(d.children).toBeDefined();
			expect(d._children).toBeUndefined();
			expect(d.edges).toBeDefined();
			expect(d._edges).toBeUndefined();

			simulateEvent(procNode.node(), 'click', {});
			expect(d._children).toBeDefined();
			expect(d.children).toBeUndefined();
			expect(d._edges).toBeDefined();
			expect(d.edges).toBeUndefined();

			sch.terminate();
		},
		(reason) => {
			throw new Error(reason);
		}
	);

});



describe("Testing yosys", () => {
    let testFiles = ["comparator", "mux2x1", "mux4x2", "constAdder", "subModuleBlackbox",
        "subModuleBlackbox2", "partialConstDriver0", "partialConstDriver1", "partialConstDriver2",
        "partialConstDriver3", "partialConstDriver4", "partialConstDriver5",
        "partialConstDriver6", "wireModule", "slice0", "slice1", "slice2",
        "slice3", "slice4", "slice5", "slice6", "slice7", "constPortDriver", "dff_sync_reset",
        "fifo", "latchinf", "concat0", "concat1", "concat2", "fulladder_4bit", "moduleWithHierarchicalOutput0",
        "moduleWithHierarchicalOutput1", "moduleWithHierarchicalOutput2", "moduleWithHierarchicalOutput3",
        "moduleWithHierarchicalOutput4", "moduleWithHierarchicalOutput5", "moduleWithHierarchicalOutput6"];

    for (const testFile of testFiles) {
        it("Testing file: " + testFile, () => {
            let f = YOSYS_EXAMPLES + "/" + testFile + ".json";
            let graphData = JSON.parse(fs.readFileSync(f));
            let [output, builder] = HwSchematic.fromYosys(graphData);
            detectDuplicitIds(output, {});
            checkMaxId(output);
            let refF = __dirname + "/data/" + testFile + ".json";
            // fs.writeFileSync(refF, JSON.stringify(output, null, 2)); //create refFiles
            let refGraphData = JSON.parse(fs.readFileSync(refF));
            expect(output).toEqual(refGraphData);
        })
    }
});

