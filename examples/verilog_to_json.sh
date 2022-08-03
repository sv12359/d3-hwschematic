#!/bin/bash

# Script expects one top file and verilog files.
# It creates json from the files using yosys.
help_message="Usage: $0 -t TOP FILE...
TOP is top component in verilog to generate json for.
FILE is a verilog input source file. Multiple file input is supported.

The script generates json from verilog files using yosys."

while getopts "t:h" arg; do
  case $arg in
    h)
      echo "use: $0 -t top verilog_files.v"
      exit 0;
      ;;
    t)
      top=$OPTARG
      if test -z top; then
      	echo top is missing
      	exit 1
      fi;
      ;;
     ?)
       exit 1;
       ;;
  esac
  shift;
  shift;
  files=""
  while test -n "$1"; do
     files="$files $1"
  	 shift
  done;
done

# -noabc is used to avoid the dissolving of operators to elementary gates
# -noalumacc is used to keep comparators and arithmetic operators in original form
# -nordff is used to avoid the use of special DFFs
yosys -Q -p "read_verilog $files;"\
 -p "hierarchy -top $top;"\
 -p "synth -run coarse -noabc -noalumacc -nordff;"\
 -p "splice"\
 -p "#show -stretch; # show circuit in yosys graphviz"\
 -p "write_json $top.json;"
 
exit $?
