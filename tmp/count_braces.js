import fs from 'fs';
const content = fs.readFileSync('d:/Freelance Projects/Translator New/src/components/Chat/ChatWindow.tsx', 'utf8');
let open = 0;
let close = 0;
for (const char of content) {
    if (char === '{') open++;
    if (char === '}') close++;
}
console.log(`Open: ${open}, Close: ${close}`);
