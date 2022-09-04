const yosys_To_Hw_Schematic_Operator_Name_Map = {
    "$mux": "MUX",
    "$pmux": "MUX",
    "$gt": "GT",
    "$lt": "LT",
    "$ge": "GE",
    "$le": "LE",
    "$not": "NOT",
    "$logic_not": "NOT",
    "$logic_and": "AND",
    "$and": "AND",
    "$logic_or": "OR",
    "$or": "OR",
    "$xor": "XOR",
    "$eq": "EQ",
    "$ne": "NE",
    "$add": "ADD",
    "$sub": "SUB",
    "$mul": "MUL",
    "$div": "DIV",
    "$slice": "SLICE",
    "$concat": "CONCAT",
    "$dff": "FF",
    "$shift": "SHIFT",
    "$shiftx": "SHIFT"

};


export function yosysTranslateIcon(node, cell) {
    let meta = node.hwMeta;
    const t = cell.type;

    if (t === "$adff") {
        meta.cls = "Operator";
        let arstPolarity = cell.parameters["ARST_POLARITY"];
        let clkPolarity = cell.parameters["CLK_POLARITY"];
        if (clkPolarity && arstPolarity) {
            meta.name = "FF_ARST_clk1_rst1";
        } else if (clkPolarity) {
            meta.name = "FF_ARST_clk1_rst0";
        } else if (arstPolarity) {
            meta.name = "FF_ARST_clk0_rst1";
        } else {
            meta.name = "FF_ARST_clk0_rst0";
        }
    } else if (t === "$dlatch") {
        meta.cls = "Operator";
        let enPolarity = cell.parameters["EN_POLARITY"];
        if (enPolarity) {
            meta.name = "DLATCH_en1";
        } else {
            meta.name = "DLATCH_en0";
        }
    } else {
        let name = yosys_To_Hw_Schematic_Operator_Name_Map[t];
        if (typeof name === "undefined") {
            return;
        }
        meta.cls = "Operator";
        meta.name = name;
    }
}