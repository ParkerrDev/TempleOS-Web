import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";

const ROOT=new URL("../assets/",import.meta.url),CHUNK_LINES=512,
  PASSAGE_LINES=20,BOOKS=("Genesis|Exodus|Leviticus|Numbers|Deuteronomy|"+
  "Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|"+
  "2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|"+
  "Song of Songs|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|"+
  "Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|"+
  "Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|"+
  "Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|"+
  "2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|"+
  "1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation").split("|");
const source=await readFile(new URL("kjv.txt",ROOT)),
  lines=source.toString("utf8").replace(/\r/g,"").trimEnd().split("\n"),
  books=[],refs=[];
let i,start,match,verse="",n=0,chunk;
for (i=0;i<lines.length;i++) {
  if (/^1:1 /.test(lines[i]))
    books.push({line:i,name:BOOKS[n++]});
  refs.push(verse);
  for (match of lines[i].matchAll(/\b(\d+:\d+)\b/g))
    verse=match[1];
}
if (books.length!=BOOKS.length)
  throw new Error("The Bible text must have all 66 books.");
await mkdir(new URL("bible/",ROOT),{recursive:true});
for (start=0;start<lines.length;start+=CHUNK_LINES) {
  chunk={verse:refs[start],lines:lines.slice(start,start+CHUNK_LINES+
    PASSAGE_LINES-1)};
  await writeFile(new URL("bible/"+start/CHUNK_LINES+".json",ROOT),
    JSON.stringify(chunk)+"\n");
}
await writeFile(new URL("bible/index.json",ROOT),JSON.stringify({
  sha256:createHash("sha256").update(source).digest("hex"),
  lines:lines.length,chunkLines:CHUNK_LINES,passageLines:PASSAGE_LINES,books
})+"\n");
console.log("Bible: "+lines.length+" lines, "+books.length+" books, "+
  Math.ceil(lines.length/CHUNK_LINES)+" bounded chunks.");
