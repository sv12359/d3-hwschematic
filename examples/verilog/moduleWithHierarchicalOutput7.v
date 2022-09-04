module subModule2(input A_0_0, input A_0_1, input A_0_2,
                  output B_0_0, output B_0_1, output B_0_2,
                  input C_0_0, input C_0_1, input C_0_2,
                  output D_0_0, output D_0_1, output D_0_2);
  assign {A_0_0, A_0_1, A_0_2} =  {B_0_0, B_0_1, B_0_2};
  assign {C_0_0, C_0_1, C_0_2} =  {D_0_0, D_0_1, D_0_2};
endmodule

module subModule1(input A_0_0, input A_0_1, input A_0_2,
                  output B_0_0, output B_0_1, output B_0_2,
                  input C_0_0, input C_0_1, input C_0_2,
                  output D_0_0, output D_0_1, output D_0_2);
  subModule2 u2(A_0_0, A_0_1, A_0_2,
                B_0_0, B_0_1, B_0_2,
                C_0_0, C_0_1, C_0_2,
                D_0_0, D_0_1, D_0_2);
endmodule

module subModule0(input A_0_0, input A_0_1, input A_0_2,
                  output B_0_0, output B_0_1, output B_0_2,
                  input C_0_0, input C_0_1, input C_0_2,
                  output D_0_0, output D_0_1, output D_0_2);
  subModule1 u1(A_0_0, A_0_1, A_0_2,
                B_0_0, B_0_1, B_0_2,
                C_0_0, C_0_1, C_0_2,
                D_0_0, D_0_1, D_0_2);
endmodule

module moduleWithHierarchicalOutput7(
                  input A_0_0, input A_0_1, input A_0_2,
                  output B_0_0, output B_0_1, output B_0_2,
                  input C_0_0, input C_0_1, input C_0_2,
                  output D_0_0, output D_0_1, output D_0_2);
  subModule0 u0(A_0_0, A_0_1, A_0_2,
                B_0_0, B_0_1, B_0_2,
                C_0_0, C_0_1, C_0_2,
                D_0_0, D_0_1, D_0_2);
endmodule

