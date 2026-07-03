const fs = require('fs');
const content = fs.readFileSync('c:/Users/Asus/Downloads/tuina.ai/src/components/etude/EtudeEngine.tsx', 'utf8');
let openBraces = 0;
let openParens = 0;
for(let i=0; i<content.length; i++) {
  if (content[i] === '{') openBraces++;
  if (content[i] === '}') openBraces--;
  if (content[i] === '(') openParens++;
  if (content[i] === ')') openParens--;
}
console.log('Open braces:', openBraces);
console.log('Open parens:', openParens);
