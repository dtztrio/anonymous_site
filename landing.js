const form = document.getElementById('link-form');
const submitBtn = document.getElementById('submit-btn');
const submitLabel = document.getElementById('submit-label');
const submitSpinner = document.getElementById('submit-spinner');
const formError = document.getElementById('form-error');
const formCard = document.getElementById('form-card');
const resultCard = document.getElementById('result-card');
const resultLink = document.getElementById('result-link');
const copyBtn = document.getElementById('copy-btn');

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitLabel.textContent = isLoading ? 'Verifying with Telegram…' : 'Generate my link';
  submitSpinner.classList.toggle('hidden', !isLoading);
}

function showError(message) {
  formError.textContent = message;
  formError.classList.remove('hidden');
}

function clearError() {
  formError.classList.add('hidden');
  formError.textContent = '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const botToken = document.getElementById('botToken').value.trim();
  const chatId = document.getElementById('chatId').value.trim();
  const displayName = document.getElementById('displayName').value.trim();

  if (!botToken || !chatId) {
    showError('Please fill in both your bot token and chat ID.');
    return;
  }

  setLoading(true);

  try {
    const resp = await fetch('/api/create-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken, chatId, displayName }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      showError(data.error || 'Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    resultLink.value = data.link;
    formCard.classList.add('hidden');
    resultCard.classList.remove('hidden');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    console.error(err);
    showError('Could not reach the server. Check your connection and try again.');
    setLoading(false);
  }
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(resultLink.value);
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = original; }, 1500);
  } catch {
    resultLink.select();
    document.execCommand('copy');
  }
});
