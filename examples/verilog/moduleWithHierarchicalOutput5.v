module subModule0(input A_0_0, input A_0_1, input A_0_2, output A_B_0, output A_C_0);
  assign {A_0_0, A_0_1, A_0_2, A_B_0, A_C_0} = 0;
endmodule

module moduleWithHierarchicalOutput5(input A_0_0, input A_0_1, input A_0_2, output A_B_0, output A_C_0);
  subModule0 b(A_0_0, A_0_1, A_0_2, A_B_0, A_C_0);
endmodule

