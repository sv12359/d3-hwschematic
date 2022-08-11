module subModule0(output out_a_1, output out_a_2, output out_2);
  assign {out_a_1, out_a_2, out_2} = 0;
endmodule

module moduleWithHierarchicalOutput1(output out_a_1, output out_a_2, output out_2);
  subModule0 b(out_a_1, out_a_2, out_2);
endmodule

