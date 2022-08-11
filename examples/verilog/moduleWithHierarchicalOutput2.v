module subModule0(output out_a_1, output out_a_2, output out_2, output out);
  assign {out_a_1, out_a_2, out_2, out} = 0;
endmodule

module moduleWithHierarchicalOutput2(output out_a_1, output out_a_2, output out_2);
  subModule0 b(out_a_1, out_a_2, out_2);
endmodule

