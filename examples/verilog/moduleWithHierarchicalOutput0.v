module subModule0(output out_0, output out_1, output out_2);
  assign {out_2, out_1, out_0} = 0;
endmodule

module moduleWithHierarchicalOutput0(output out_0, output out_1, output out_2);
  subModule0 b(out_0, out_1, out_2);
endmodule

