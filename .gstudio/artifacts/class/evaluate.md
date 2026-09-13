<llm>Input: class name</llm>
<deterministic>
    Evaluate that: 
        1. The file has ONLY have one top level definition and must be a named export of a class.
    
    If it complies with all the rules, exits 0.
    Otherwise, iterate over each discrepancy, print them to stdout and exit with 1.
</deterministic>
<llm>
    Evaluate that:
        1. The functions defined in the class are only from the scope of the class, any general purpose utility function must be defined at the respective utils class called by the name of the type (StringUtils, FunctionUtils, NumberUtils, etc...)
</llm>