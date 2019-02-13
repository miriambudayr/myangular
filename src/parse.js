'use strict';
var _ = require('lodash');
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


var ESCAPES = {
  'n': '\n',
  'f': '\f',
  'r': '\r',
  't': '\t',
  'v': '\v',
  '\'': '\'',
  '"': '"'
};

/*
-External-facing function.
-Takes Angular expression string.
-Returns function that executes expression in certain context.
*/

function parse(expr) {
  var lexer = new Lexer();
  var parser = new Parser(lexer);
  return parser.parse(expr);
}

function Lexer() {}


/*
Lexer.prototype.lex executes tokenization.
Iterates over all characters in given input string.
During iteration, it forms collection of tokens the string includes.
*/

Lexer.prototype.lex = function(text) {
  this.text = text;
  this.index = 0;
  this.ch = undefined;
  this.tokens = [];

  //Conditionals set up to deal with different kinds of characters.
  while (this.index < this.text.length) {
    this.ch = this.text.charAt(this.index);
    if (this.isNumber(this.ch) ||
        (this.ch === '.' && this.isNumber(this.peek()))) {
      //Delegate to helper method readNumber.
      this.readNumber();
    } else if (this.ch === '"'|| this.ch === '\'') {
      this.readString(this.ch);
    } else {
      throw 'Unexpected next character: ' + this.ch;
    }
  }

  return this.tokens;
};

/*
Iterates over text character by character.
Builds up number as it goes.
*/
Lexer.prototype.readNumber = function() {
  var number = '';
  while (this.index < this.text.length) {
    var ch = this.text.charAt(this.index);
    if (this.isNumber(ch) || ch === '.') {
      number += ch;
    } else {
      var nextCh = this.peek();
      var previousCh = this.text.charAt(number.length - 1);
      if ((ch === 'e' || ch === 'E') && this.isExpOperator(nextCh)) {
        number += ch;
      } else if (this.isExpOperator(ch) && (previousCh === 'e' || previousCh === 'E') &&
                   nextCh && this.isNumber(nextCh)) {
        number += ch;
      } else if (this.isExpOperator(ch) && previousCh === 'e' &&
                   (!nextCh || !this.isNumber(nextCh))) {
        throw 'Invalid exponent';
      } else {
        break;
      }
    }
    this.index++;
  }
  this.tokens.push({
    text: number,
    value: Number(number)
  });
};

Lexer.prototype.readString = function(quote) {
  var string = '';
  var escape = false;
  this.index++;
  while (this.index < this.text.length) {
    var ch = this.text.charAt(this.index);
    if (escape) {
      if (ch === 'u') {
        var hex = this.text.substring(this.index + 1, this.index + 5);
        if (!hex.match(/[\da-f]{4}/i)) {
          throw 'Invalid unicode escape';
        }
        this.index +=4;
        string += String.fromCharCode(parseInt(hex, 16));
      } else {
        var replacement = ESCAPES[ch];
        if (replacement) {
          string += replacement;
        } else {
          string += ch;
        }
      }
      escape = false;
    } else if (ch === quote) {
      this.index++;
      this.tokens.push({
        text: string,
        value: string
      });
      return;
    } else if (ch === '\\') {
      escape = true;
    } else {
      string += ch;
    }
    this.index++;
  }
  throw 'Unmatched quote';
};

Lexer.prototype.isNumber = function(ch) {
  return '0' <= ch && ch <= '9';
};

//Texts for a character that is allowed to come after the e character in scientific notation. +, -, or number.
Lexer.prototype.isExpOperator = function(ch) {
  return ch === '-' || ch === '+' || this.isNumber(ch);
};

/*
Returns the next character in the text without moving
the current character index forward.
*/
Lexer.prototype.peek = function() {
  if (this.index < (this.text.length - 1)) {
    return this.text.charAt(this.index + 1);
  } else {
    return false;
  }
};

/*
AST is a nested JS object structure that represents an expression in tree-like form.
Each node in the tree will have a type attribute that describes the  syntactic
structure the node represents.
Nodes will also have type-specific attributes that hold further info about the node.
*/

function AST(lexer) {
  this.lexer = lexer;
}

AST.prototype.ast = function(text) {
  //AST building will be done here.
  this.tokens = this.lexer.lex(text);
  return this.program();
};

AST.prototype.program = function() {
  return {type: AST.Program, body: this.constant()};
};

AST.prototype.constant = function() {
  return {type: AST.Literal, value: this.tokens[0].value};
};

/*
Marker constant used to identify what type of node is
being represented. In AST compilation phase, these help make decisions about
what kind of JS code to generate.
*/
AST.Program = 'Program';
AST.Literal = 'Literal';

//Takes astBuilder as an argument.
function ASTCompiler(astBuilder) {
  this.astBuilder = astBuilder;
}

/*
Compiles an expression into an expression function.
Walks over tree generated by AST Builder. Builds up JS
source code that represents nodes in the tree.
Generates JS function for source code.
*/
ASTCompiler.prototype.compile = function(text) {
  //AST compilation will be done here.
  var ast = this.astBuilder.ast(text);
  //The JS code that forms the body of the fn.
  this.state = {body: []};
  this.recurse(ast);
  /* jshint -W054 */
  return new Function(this.state.body.join(''));
  /* jshint -W054 */
};

ASTCompiler.prototype.recurse = function(ast) {
  switch (ast.type) {
    //Generate the return statement for whole expression.
    case AST.Program:
      this.state.body.push('return ', this.recurse(ast.body), ';');
      break;
    case AST.Literal:
      return this.escape(ast.value);
  }
};

ASTCompiler.prototype.escape = function(value) {
  if (_.isString(value)) {
    return '\'' +
      value.replace(this.stringEscapeRegex, this.stringEscapeFn) +
      '\'';
  } else {
    return value;
  }
};

ASTCompiler.prototype.stringEscapeRegex = /[^ a-zA-Z0-9]/g;

ASTCompiler.prototype.stringEscapeFn = function(c) {
  return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
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
