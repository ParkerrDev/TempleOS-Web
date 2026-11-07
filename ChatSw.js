//Android shows a notification only from a service worker. This one shows
//the chat's (ChatWin.js registers it the first time it needs one) and brings
//the page back when one is clicked. It handles no fetches, so it never
//touches how the site loads.
function Focus(lst)
{
  if (lst.length)
    return lst[0].focus();
  return clients.openWindow("./");
}

function Clicked(e)
{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:"window"}).then(Focus));
}

addEventListener("notificationclick",Clicked);
