const text1 = "4ターン目以降、ターン経過ごとにATK200%UP(最大600%)";
const text2 = "ターン経過ごとにATK10%UP(最大50%)";

const regex = /(?:(\d+)ターン目以降、)?ターン経過ごとにATK(\d+)%UP\(最大(\d+)%\)/;

console.log("text1: ", text1.match(regex));
console.log("text2: ", text2.match(regex));
