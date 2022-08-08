module split7(input [3-1:0] in, output out0, output out1, output out2, output [3-1:0] out3);
  assign out0 = in[0];
  assign out1 = in[1];
  assign out2 = in[2];
  assign out3 = in;
endmodule
