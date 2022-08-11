module subModule0(output A_0_0, output A_0_1, output A_0_2, input A_B_0, input A_C_0);
  assign {A_0_0, A_0_1, A_0_2, A_B_0, A_C_0} = 0;
endmodule

module moduleWithHierarchicalOutput4(output A_0_0, output A_0_1, output A_0_2, input A_B_0, input A_C_0);
  subModule0 b(A_0_0, A_0_1, A_0_2, A_B_0, A_C_0);
endmodule

