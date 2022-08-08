#!/bin/bash

# Internal scipt for generating yosys test files,

RED="\033[0;31m"
GREEN="\033[0;32m"
NC="\033[0m"
cd verilog
for filename in *; do
	name=`echo $filename | cut -d"." -f1`
	../verilog_to_json.sh -t $name $filename
	if test $? -eq 1; then
		echo -e "\n\n${RED}[Error]${NC} in the translation of verilog file to json: $filename"
		exit 1
	fi; 
	mv $name.json ../schemes_yosys

done;
cd ..
echo -e "\n\n${GREEN}[Success]${NC} all veriog files were translated to json"
