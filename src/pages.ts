export const PRIVACY_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ball Knowledge Games – Privacy Policy</title>
<style>body{font:17px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;padding:24px 20px 64px;color:#14213d;background:#f6f7fb}h1{font-size:28px;line-height:1.2}h2{font-size:20px;margin-top:28px}a{color:#007f99}code{font-size:14px;word-break:break-all}footer{margin-top:40px;font-size:14px;color:#5b6475}</style>
</head><body>
<h1>Ball Knowledge Games – Privacy Policy</h1>
<p>Effective October 8, 2026</p>
<p>Ball Knowledge Games ("Ball Knowledge", "the app") is made by Kaleb Jensen, an independent developer in the United States ("I", "me"). This policy explains what happens to information when you use the iPhone app. Contact: <a href="mailto:k24corp@gmail.com">k24corp@gmail.com</a>.</p>
<h2>The short version</h2>
<ul>
<li>No account and no sign-in.</li>
<li>I do not collect, sell, or share personal information.</li>
<li>The app has no ads, no analytics, no crash-reporting SDK, and no tracking.</li>
<li>Your game progress is saved on your iPhone only.</li>
<li>The app downloads a public list of trivia prompts. That download does not include anything about you.</li>
<li>When you finish a Blind Ranking, the app sends your five-pick order with a random install code so it can show everyone's average ranking. It is not linked to your name, Apple ID, or contacts.</li>
</ul>
<h2>Information saved on your device</h2>
<p>The app saves these items in its own storage on your iPhone:</p>
<ul>
<li>whether you have played today's daily board, and the date (Mountain Time);</li>
<li>a daily board or Group Room round you have started but not finished;</li>
<li>the prompt list it last downloaded, so the app works without a connection;</li>
<li>whether you have already seen the How to Play screens.</li>
</ul>
<p>Group Room seats are labeled Player 1 through Player 4. The app does not ask for names. The app does not send any of this information to me or anyone else. It stays on the device. If iCloud or iTunes backups are turned on for your iPhone, Apple may include the app's storage in that backup under Apple's own terms. Deleting the app deletes all of it.</p>
<h2>The prompt download</h2>
<p>When you open the app or start a round, it asks my prompt server for the current list of prompts:</p>
<p><code>https://sports-today-prompts.k24corp.workers.dev/prompts</code></p>
<p>This is an ordinary HTTPS request. It does not contain an account, a device identifier, an advertising identifier, your guesses, or your scores. Like any internet request, it reveals your network's IP address and basic technical details, such as the app's version and your iOS version, to the server so it can send a response.</p>
<p>The server runs on Cloudflare Workers. I have turned off per-request logging for this service, so I do not keep records of who downloaded the prompts. Cloudflare, as the hosting provider, processes the request to deliver it and to protect the service from abuse. Cloudflare may keep limited operational and security data under its own privacy policy (<a href="https://www.cloudflare.com/privacypolicy/">https://www.cloudflare.com/privacypolicy/</a>). I do not use this data to identify you, build a profile, advertise, or track you.</p>
<p>If the download fails, for example in Airplane Mode, the app uses prompts already saved on your iPhone.</p>
<h2>Blind Ranking community ranking</h2>
<p>When you finish a Blind Ranking, the app sends my server the date, the topic, the order you placed the five picks in, and a random code the app created when it was installed. The random code lets the server count one ranking per install per topic per day; a later ranking from the same install replaces the earlier one. The server stores only a one-way scrambled version of that code, not the code itself, together with the date, topic, and order. It does not receive your name, Apple ID, contacts, Messages conversations, location, or an advertising identifier, and I do not link these rankings to you.</p>
<p>The server combines rankings into an average order for each topic. That average, and the number of rankings, are shown to everyone once a topic has at least 10 rankings that day. Individual rankings are never shown. The rankings are stored with Cloudflare D1 and are used only for this feature.</p>
<h2>Information you choose to send me</h2>
<p>If you email support, I receive your email address and anything you put in the message. I use it only to answer you. I do not add you to a mailing list. I delete support emails when they are no longer needed, and you can ask me to delete yours at any time.</p>
<h2>Apple</h2>
<p>Apple handles App Store downloads, and any purchases if they are added later, under Apple's privacy policy. If you have chosen to share analytics with app developers in your iPhone settings, Apple may give me aggregated, de-identified statistics and crash reports. I use those only to fix bugs and improve the app.</p>
<h2>Third parties</h2>
<p>The only outside service involved in running the app is Cloudflare, which hosts the prompt server. No third-party SDKs are built into the app. If I ever share data with a third party, that party will be required to protect it as well as this policy does, and this policy will be updated first.</p>
<h2>Keeping and deleting data</h2>
<p>I have no account data about you on any server. Blind Ranking orders are stored only with the scrambled random code described above, which I cannot connect back to you. To delete everything the app has saved, delete the app from your iPhone. To delete a support email, write to <a href="mailto:k24corp@gmail.com">k24corp@gmail.com</a>.</p>
<h2>Your choices and consent</h2>
<p>The app does not ask for permission to use your camera, photos, microphone, location, contacts, or tracking, because it does not use them. You can stop the prompt download by turning off Wi-Fi and cellular data for the app in iPhone Settings. The app will keep working with saved prompts.</p>
<h2>Children</h2>
<p>The app is a general-audience sports trivia game and is not directed at children under 13. I do not knowingly collect personal information from anyone, including children. If you believe a child has emailed me personal information, write to <a href="mailto:k24corp@gmail.com">k24corp@gmail.com</a> and I will delete it.</p>
<h2>Changes to this policy</h2>
<p>If the app changes how it handles information, for example by adding ads or in-app purchases, I will update this policy and the date at the top before the change goes live. The current version is always at this address and in the app under Privacy.</p>
<h2>Contact</h2>
<p>Kaleb Jensen
<a href="mailto:k24corp@gmail.com">k24corp@gmail.com</a></p>
<footer><a href="/privacy">Privacy Policy</a> · <a href="/support">Support</a> · <a href="mailto:k24corp@gmail.com">k24corp@gmail.com</a></footer>
</body></html>
`;

export const SUPPORT_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ball Knowledge Games – Support</title>
<style>body{font:17px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;padding:24px 20px 64px;color:#14213d;background:#f6f7fb}h1{font-size:28px;line-height:1.2}h2{font-size:20px;margin-top:28px}a{color:#007f99}code{font-size:14px;word-break:break-all}footer{margin-top:40px;font-size:14px;color:#5b6475}</style>
</head><body>
<h1>Ball Knowledge Games – Support</h1>
<p>Need help, found a wrong answer, or have an idea for a prompt? Email <strong><a href="mailto:k24corp@gmail.com">k24corp@gmail.com</a></strong>. I read every message and usually reply within 2 business days.</p>
<p>Please include:
- whether you were playing today's board or Group Room;
- the mode (Top 10 Guess, Blind Ranking, Fact or Cap, Higher or Lower, or Keep 3 Cut 5) and the prompt title;
- what happened, and your iPhone model and iOS version.</p>
<h2>Common questions</h2>
<p><strong>When does a new daily board appear?</strong>
After midnight Mountain Time (America/Denver). Each day you get one free board. If you start it and leave, you can resume it the same day from Home.</p>
<p><strong>Why can't I play the daily board again?</strong>
The free daily board is one per day. Group Room has no daily limit, and you can play any of the five modes there.</p>
<p><strong>How does Group Room work?</strong>
Choose a mode and a prompt, choose 2 to 4 seats, then pass the phone. Each player takes a turn on the same board. Scores appear at the end. Everything stays on this one iPhone.</p>
<p><strong>Do I need an account or internet?</strong>
No account. The app downloads new prompts when it can. Without a connection it uses prompts already saved on your iPhone.</p>
<p><strong>How do I see the rules again?</strong>
On Home, tap How to Play.</p>
<p><strong>How do I reset everything?</strong>
Delete and reinstall the app. That removes all saved rounds. There is no account to delete.</p>
<p><strong>A stat or answer looks wrong.</strong>
Email me the prompt title and what you think is right. Career numbers are checked against public records and updated over time.</p>
<p>Privacy Policy: <a href="https://sports-today-prompts.k24corp.workers.dev/privacy">https://sports-today-prompts.k24corp.workers.dev/privacy</a></p>
<p>Ball Knowledge Games is an independent app. It is not affiliated with, endorsed by, or sponsored by any professional league, team, or player.</p>
<footer><a href="/privacy">Privacy Policy</a> · <a href="/support">Support</a> · <a href="mailto:k24corp@gmail.com">k24corp@gmail.com</a></footer>
</body></html>
`;
