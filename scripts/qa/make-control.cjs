// Control copy: identical export, but the numeric-looking text cells become real numbers and "TRUE" becomes a boolean.
const fs=require('fs'),path=require('path');
const {unzipSync,zipSync,strFromU8,strToU8}=require(process.argv[2]+'/node_modules/fflate');
const src=fs.readFileSync(process.argv[3]);const parts=unzipSync(src);
const targets={'xl/worksheets/sheet4.xml':['O12','O24'],'xl/worksheets/sheet5.xml':['D14'],'xl/worksheets/sheet7.xml':['D5','K6','V74'],'xl/worksheets/sheet9.xml':['D6'],'xl/worksheets/sheet3.xml':['J30']};
for(const [p,refs] of Object.entries(targets)){let x=strFromU8(parts[p]);for(const r of refs){
 x=x.replace(new RegExp('<c r="'+r+'"([^>]*?) t="inlineStr"><is><t xml:space="preserve">([^<]*)</t></is>'),(m,attrs,v)=>v==='TRUE'||v==='FALSE'?`<c r="${r}"${attrs} t="b"><v>${v==='TRUE'?1:0}</v>`:`<c r="${r}"${attrs}><v>${v}</v>`);}
 parts[p]=strToU8(x);}
fs.writeFileSync(process.argv[4],zipSync(parts,{level:6}));console.log('control written');
