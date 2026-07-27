import translate from 'google-translate-api-x';

async function run() {
  try {
    const res = await translate("ഹലോ ഡിയസ് വെൽക്കം ബാക്ക് ടു സൈലം ലേണിങ്", { to: 'en' });
    console.log(res.text);
  } catch (e) {
    console.error(e);
  }
}
run();
