import { expect, test } from '@playwright/test';

test('home links open display, judge and timeline flows', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Race control/ })).toBeVisible();

  await page.getByRole('link', { name: /Leaderboard live/ }).click();
  await expect(page.getByTestId('leaderboard-display')).toBeVisible();
  await page.getByTestId('display-category-MM').click();
  await expect(page.getByText('Team Alpha')).toBeVisible();
  await page.getByTestId('display-mode-stations').click();
  await expect(page.getByTestId('display-stations-mode')).toContainText('Echo Bike');
  await page.getByTestId('display-mode-multi').click();
  await expect(page.getByTestId('display-multi-mode')).toBeVisible();

  await page.goto('/');
  await page.getByRole('link', { name: /Score mobile/ }).click();
  await expect(page.getByTestId('judge-station-name')).toContainText('Echo Bike');
  await expect(page.getByTestId('station-switch')).toHaveCount(0);
  await expect(page.getByTestId('current-heat-toggle')).toBeVisible();
  await page.getByTestId('all-heats-toggle').click();
  await expect(page.getByTestId('score-team-alpha')).toContainText('0');
  await expect(page.getByTestId('validate-score-button')).toBeVisible();
  await expect(page.getByTestId('score-button-team-alpha-10')).toBeVisible();
  await expect(page.getByTestId('score-button-team-bravo-10')).toHaveCount(0);
  await page.getByTestId('score-button-team-alpha-10').click();
  await expect(page.getByTestId('score-team-alpha')).toContainText('10');
  await page.getByTestId('validate-score-button').click();
  await expect(page.getByTestId('judge-message')).toContainText('Score validato');
  await expect(page.getByTestId('scorecard-status-team-alpha')).toContainText('validato: 10');
  await expect(page.getByTestId('score-button-team-bravo-10')).toBeVisible();

  await page.getByTestId('back-score-button').click();
  await expect(page.getByTestId('correct-score-team-alpha')).toBeVisible();
  await page.getByTestId('correct-last-button').click();
  await page.getByTestId('confirm-correction-button').click();
  await expect(page.getByText(/nota di correzione obbligatoria/)).toBeVisible();
  await page.getByTestId('correction-note').fill('Errore di conteggio');
  await page.getByTestId('confirm-correction-button').click();
  await expect(page.getByTestId('status-badge-team-alpha')).toContainText('Corretto');
  await page.getByTestId('score-button-team-alpha-5').click();
  await expect(page.getByTestId('score-team-alpha')).toContainText('15');
  await page.getByTestId('validate-score-button').click();
  await expect(page.getByTestId('audit-log-count')).toContainText('1');
  await expect(page.getByTestId('score-button-team-bravo-10')).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Confermi score 0?');
    await dialog.accept();
  });
  await page.getByTestId('validate-score-button').click();
  await expect(page.getByTestId('score-button-team-charlie-10')).toBeVisible();
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByTestId('validate-score-button').click();
  await expect(page.getByTestId('score-button-team-delta-10')).toBeVisible();
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByTestId('validate-score-button').click();
  await expect(page.getByTestId('judge-summary')).toContainText('Riepilogo finale stazione');

  await page.goto('/judge/token-non-valido');
  await expect(page.getByRole('heading', { name: /Token giudice non valido/ })).toBeVisible();

  await page.goto('/judge/demo-multi-station');
  await expect(page.getByTestId('station-switch')).toBeVisible();
  await page.getByTestId('station-switch').selectOption('station-rower');
  await expect(page.getByTestId('judge-station-name')).toContainText('Rower');
  await expect(page.getByTestId('score-team-alpha')).toContainText('0');

  await page.goto('/');
  await page.getByRole('link', { name: /Timeline builder/ }).click();
  await expect(page.getByTestId('timeline-builder')).toContainText('Timeline generata');
  await expect(page.getByText(/categorie/)).toBeVisible();
  await expect(page.getByTestId('timeline-export-pdf')).toBeVisible();

  await page.goto('/');
  await page.getByRole('link', { name: /Partecipanti/ }).click();
  await expect(page.getByTestId('participants-admin')).toBeVisible();
  await page.getByLabel('Categoria').selectOption('cat-mf');
  await page.getByLabel('Nome team/atleta').fill('Team E2E');
  await page.getByLabel('Bib').fill('99');
  await page.getByLabel('Membro 1 nome').fill('Mario');
  await page.getByLabel('Membro 1 cognome').fill('Test');
  await page.getByLabel('Membro 2 nome').fill('Franca');
  await page.getByLabel('Membro 2 cognome').fill('Test');
  await page.getByRole('button', { name: /Crea partecipante/ }).click();
  await expect(page.getByText('Team E2E')).toBeVisible();
});
