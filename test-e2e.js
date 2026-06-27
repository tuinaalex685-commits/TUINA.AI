const puppeteer = require('puppeteer');

(async () => {
  console.log('--- STARTING E2E TEST ---');
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    console.log('1. Accès à localhost:3000/login');
    await page.goto('http://localhost:3000/login');
    
    // Check if login form exists
    const emailInput = await page.input[type="email"];
    if (emailInput) {
      await page.type('input[type="email"]', 'test_auto@example.com');
      await page.type('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle0' });
      console.log('Connecté avec succès.');
    } else {
      console.log('Déjà connecté ou page différente.');
    }

    console.log('2. Navigation vers /app/redaction');
    await page.goto('http://localhost:3000/app/redaction', { waitUntil: 'networkidle0' });

    console.log('3. Création d\'une rédaction');
    const [nouveauBtn] = await page.('//button[contains(., "+ Nouveau")]');
    if (nouveauBtn) {
      await nouveauBtn.click();
      await page.waitForSelector('input[placeholder="Titre ou sujet..."]');
      await page.type('input[placeholder="Titre ou sujet..."]', 'Test Redaction');
      const [creerBtn] = await page.('//button[contains(., "Créer")]');
      await creerBtn.click();
      await page.waitForSelector('textarea');
      console.log('Rédaction créée.');
    } else {
      console.log('Bouton + Nouveau introuvable.');
    }

    await browser.close();
    console.log('--- END E2E TEST ---');
  } catch (err) {
    console.error('Erreur durant le test E2E:', err);
    process.exit(1);
  }
})();
