'use strict';
/*
Four objects do the work of turning expression strings into functions.
-Lexer: takes original expression string and returns array of tokens parsed from that string.
Ex. string "a+b" results in tokens for a, +, and b.
-AST Builder: takes the array of tokens from lexer. Builds Abstract Syntax Tree.
Tree represents syntactic structure of expression as nested JS objects.
-AST Compiler: takes abstract syntax tree and compiles it into JS function that
evaluates expression represented in the tree.
-Parser: responsible for combining the low-level steps above. Delegates heavy lifting to Lexer, AST Builder, and AST Compiler.
*/


/*
-External-facing function.
-Takes Angular expression string.
-Returns function that executes expression in certain context.
*/

function parse(expr) {
  var lexer = new Lexer();
  var parser = new Parser(lexer);
  return parser.parser(expr);
}

function Lexer() {}


//Lexer.prototype.lex executes tokenization.
Lexer.prototype.lex = function(text) {
  //Tokenization will be done here.
};

function AST(lexer) {
  this.lexer = lexer;
}

AST.prototype.ast = function(text) {
  this.tokens = this.lexer.lex(text);
  //AST building will be done here.
};

//Takes astBuilder as an argument.
function ASTCompiler(astBuilder) {
  this.astBuilder = astBuilder;
}

//Compiles an expression into an expression function.
ASTCompiler.prototype.compile = function(text) {
  var ast = this.astBuilder.ast(text);
  //AST compilation will be done here.
};

//Constructs the complete parsing pipeline. Takes Lexer as an argument.
function Parser(lexer) {
  this.lexer = lexer;
  this.ast = new AST(this.lexer);
  this.astCompiler = new ASTCompiler(this.ast);
}

Parser.prototype.parse = function(text) {
  return this.astCompiler.compile(text);
};

//module.exports created by the module system in Node.
module.exports = parse;
