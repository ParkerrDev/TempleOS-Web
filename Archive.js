const ITEM="TerryADavis_TempleOS_Archive";

export function ArchiveFile(file)
{
  return "https://archive.org/download/"+ITEM+"/"+
    file.split("/").map(encodeURIComponent).join("/");
}

export function ArchiveDetails(file,seconds)
{//The Archive player double-decodes paths; literal plus signs need %252B.
  let res="https://archive.org/details/"+ITEM+"/"+
    file.split("/").map(encodeURIComponent).join("/").
      replace(/%2B/g,"%252B").replace(/%20/g,"+");
  if (seconds!=null)
    res+="?start="+Math.max(0,seconds);
  return res;
}

export function ArchiveWatch(video,seconds,base=location.href)
{
  if (video.p)
    return ArchiveDetails(video.f,seconds);
  let url=new URL("player.html",base);
  url.searchParams.set("f",video.f);
  url.searchParams.set("n",video.t || "");
  if (seconds!=null)
    url.searchParams.set("t",Math.max(0,seconds));
  return url.href;
}
