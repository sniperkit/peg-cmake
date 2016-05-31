var CMake = require('../');

var fs = require('fs');


var FormatConfig = {
  IndentWidth: 4, // space
  //ContinuationIndentWidth: 4,
  ColumnLimit: 50,
  AllowedBlankLines: 1,
  AlignAfterOpenBracket : "BAS_Align",
  TrimComments: true,
  BlankLinesAroundFunctions:true,
  BlankLinesAroundIf:true
  
}

// Simple CMake code formater ASTMatcher
// result will contain the indented buffer
// tabSize : number of space per TAB
//
function CMakeCodeFormater(config){
  this._indent =  0;
  
  
  this.tab = ()=>{
    this._indent+= config.IndentWidth;
  };
  this.untab = ()=>{
    this.result = this.result.substr(0, this.result.length-config.IndentWidth);
    this._indent-= config.IndentWidth;
  };
  
  // Will contains the result buffer
  this.result = "";
 
  this.emitString = (string) => {
    this.newlineEmitted = 0;
    return string;    
  }
  
  this.emitResult = (string) => {
    this.result += this.emitString(string);   
  }
  
  this.print = this.emitResult;
 
  this.eol = ()=>{
    return "\n" + this.indentString();
  }
  
  this.indentString = ()=>{
    return this._indent>0?Array(this._indent+1).join(" "):"";
  };
  
  this.newlineEmitted = 0;
  
  this.newline =  (elt) => {
     var currentEOLCount = this.newlineEmitted;
     if(currentEOLCount <= config.AllowedBlankLines) {
      this.print(this.eol());
      this.newlineEmitted = currentEOLCount+1;
     }
  };
  
  this.line_comment_to_string = (comment)=>{ 
    var str;
    if(config.TrimComments)
      str = this.emitString("# " + comment.value.trim());
    else
      str = this.emitString("#" + comment.value);
      
    str += this.emitString(this.eol());
    return str;
  };
  this.line_comment = (comment)=>{ 
    if(config.TrimComments)
      this.print("# " + comment.value.trim());
    else
      this.print("#" + comment.value);
      
    this.print(this.eol());
  };
  
  this.unquoted_argument = (elt)=>{ 
    return elt.value; 
  };
  
  this.quoted_argument = (elt)=>{ return "\"" + elt.value + "\""; };
  
  function current_column(str){
    var index = str.lastIndexOf("\n") + 1;
    return (index==0)?str.length :str.length - (index+1);
  }
  
  this.current_column = ()=>{
    return current_column(this.result);
  }
  
  function openBracket(len){    
    return "[" + Array(len+1).join("=") +"[";
  }
  function closeBracket(len){
    return "]" + Array(len+1).join("=") +"]";
  }
  
  this.arguments = (args)=>{
    var this_line_comment = this.line_comment;    
    var this_newline = this.newline;   
    var this_bracket_comment = this.bracket_comment;
    var this_bracket_argment = this.bracket_argument;
    
    this.newline = (e)=>{return this.eol()}; 
    this.line_comment = this.line_comment_to_string;
    this.bracket_comment = this.bracket_comment_to_string;
    this.bracket_argument =this.bracket_argument_to_string;
    var backup = this._indent;
    
    this._indent = this.current_column(); // 
    
    var arguments = args.map((arg)=>{
      if(Array.isArray(arg)){
        return "(" + this.arguments(arg) + ")";
      }else if(this[arg.type]){
        return this[arg.type](arg);
      }else
        return null;
    })
    .filter((e)=>{return e != null});
    
    var res = arguments.join(" ");
    if(res.length > config.ColumnLimit) {
      res = "";
      for(var i = 0; i < arguments.length; ++i){
        var arg = arguments[i];
        if (current_column(res) + arg.length + 1 >  config.ColumnLimit){
          res += this.eol();
        }else if(i != 0) {
          res += " "
        }
        res += arg;
        
      }
    }
    
    this._indent = backup;  
    this.line_comment = this_line_comment; 
    this.newline = this_newline;
    this.bracket_comment = this_bracket_comment;
    this.bracket_argument = this_bracket_argment;
    
    return res;
  }
  
  this.invoke = (name, args, indent) => {
    this.print(name + "(");
    var args = this.arguments(args); 
    this.print(args +")") ;
    if(typeof indent !== 'undefined'){
      if(indent){
        this.tab()
      }else {
        this.untab();
      }
    }      
  }
  
  this.command_invocation = (elt)=>{
    this.invoke(elt.identifier, elt.arguments);
  };
  
  this.func = (elt, name)=>{
    if(config.BlankLinesAroundFunctions){
      if(this.newlineEmitted <= 1) this.newline();
    }
    this.invoke(name, [{type:"unquoted_argument", value:elt.identifier}].concat(elt.arguments));
    this.tab();
    elt.body.forEach((e)=>{
      var cb = this[e.type];
      if(cb){
        cb(e);
      }
    })
    this.untab();
    this.invoke("end"+name, [{type:"unquoted_argument", value:elt.identifier}]);
    if(config.BlankLinesAroundFunctions){
      if(this.newlineEmitted <= 1) this.newline();
    }
  }
  
  this.macro = (elt)=>{
    this.func(elt, "macro");
  }
  this.function = (elt)=>{
    this.func(elt, "function");
  }
  
  
  this.loop = (elt, name)=>{
    if(config.BlankLinesAroundIf){
      if(this.newlineEmitted <= 1) this.newline();
    }
    this.invoke(name, elt.arguments, true);
    this.print(this.eol());
    elt.body.forEach((e)=>{
      var cb = this[e.type];
      if(cb){
        cb(e);
      }
    })
    this.untab();
    this.invoke("end" + name, []);
    if(config.BlankLinesAroundIf){
      if(this.newlineEmitted <= 1) this.newline();
    }
  }
  this.foreach = (elt)=>{this.loop(elt, "foreach")};
  this.while = (elt)=>{this.loop(elt, "while")};
  
  this.if = (elt)=>{
    if(config.BlankLinesAroundIf){
      if(this.newlineEmitted <= 1) this.newline();
    }
     this.invoke("if", elt.predicate, true);
     elt.body.forEach((e)=>{
      var cb = this[e.type];
      if(cb){
        cb(e);
      }
     });
    
    this.untab();
    if(elt.elseif){
      elt.elseif.forEach((e) => {
        this.invoke("elseif", elt.predicate, true);
        e.body.forEach((_e) => {
          var cb = this[_e.type];
          if (cb) {
            cb(_e);
          }
        })
        this.untab();

      });
    }
    if(elt.else){
        this.invoke("else", elt.else.predicate, true);
      elt.else.body.forEach((e) => {
          var cb = this[e.type];
          if (cb) {
            cb(e);
          }
        })
        this.untab();
    }
    this.invoke("endif", []);
    if(config.BlankLinesAroundIf){
      if(this.newlineEmitted <= 1) this.newline();
    }
  }
  
  this.bracket_argument_to_string = (elt)=>{
    return this.emitString(openBracket(elt.len) + elt.value + closeBracket(elt.len));
  }
  
  this.bracket_argument = (elt)=>{
    this.print(openBracket(elt.len) + elt.value + closeBracket(elt.len));
  }
  
  this.bracket_comment_to_string = (elt)=>{
    return this.emitString("#" + openBracket(elt.len) + elt.value + closeBracket(elt.len));
  }
  this.bracket_comment = (elt)=>{
    this.print("#" + openBracket(elt.len) + elt.value + closeBracket(elt.len));
  }
  
}

function traversAST(ast, matcher) {
  ast.forEach((element)=>{
    if(matcher[element.type])
      matcher[element.type](element);
  });
}


var myArgs = process.argv.slice(2);
 console.log('myArgs: ', myArgs);
myArgs.forEach(function(element) {

fs.readFile(element, 'utf8', function (err,data) {
  if (err) {
    return console.log(err);
  }
  try {
  var result = CMake.parse(data);
  var formater = new CMakeCodeFormater(FormatConfig);
  traversAST(result, formater);
  process.stdout.write(formater.result);
  console.log("# " + element)
   function FindFunctions() {
             this.func = (elt)=>{
               console.log("- " +elt.identifier + " : line:" + elt.location.start.line )
              }
              this.macro = this.func;
              this.function = this.func;
              this.if=(elt)=>{
                traversAST(elt.body, this);
              }
         };
   traversAST(result, new FindFunctions());
//  printElements(result);
 // console.log(JSON.stringify(result, null, 2));
  for(var i = 0; i != result.length; ++i){
      var statement = result[i];
   //   console.log(statement.type); 
  }
  }catch(e) {
      console.log(e.name + " line " + e.location.start.line 
      + ", " + e.location.start.column
      + "\n"+ e.message);
  }
});

  
});
