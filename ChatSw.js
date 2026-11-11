//Android shows a notification only from a service worker. This one shows
//the chat's (ChatWin.js registers it the first time it needs one) and brings
//the page back when one is clicked. It handles no fetches, so it never
//touches how the site loads.
async function Focus(lst)
{
  let client=lst.find(function (c) {
    let url=new URL(c.url);
    return url.pathname=="/" || url.pathname=="/index.html";
  });
  if (client) {
    await client.focus();
    client.postMessage({cmd:"chat-open"});
  } else
    await clients.openWindow("./?open=chat");
}

function Clicked(e)
{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(Focus));
}

addEventListener("notificationclick",Clicked);
