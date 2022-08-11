module subModule0(output out_0, output out_1, output out_2, out);
  assign {out_2, out_1, out_0, out} = 0;
endmodule

module moduleWithHierarchicalOutput3(output out_0, output out_1, output out_2, output out);
  subModule0 b(out_0, out_1, out_2, out);
endmodule

