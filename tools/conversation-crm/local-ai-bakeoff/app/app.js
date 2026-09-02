'use strict';

const criteria = ['naturalidade', 'saudacao', 'continuidade', 'compreensao', 'retomada', 'utilidade', 'confianca', 'cesar_enviaria'];
let bundle;
let index = 0;
let choice = null;

function current() { return bundle.cases[index]; }

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function render() {
  const item = current();
  document.querySelector('#progress').textContent = `Caso ${index + 1} de ${bundle.total_cases} · ${item.category}`;
  const context = document.querySelector('#context');
  context.replaceChildren(...item.turns.map((turn) => {
    const row = element('p');
    row.append(element('strong', `${turn.role === 'customer' ? 'Cliente' : 'Atendimento'}: `), document.createTextNode(turn.text));
    return row;
  }));
  const options = document.querySelector('#options');
  options.replaceChildren(...item.options.map((option) => {
    const button = element('button', null, 'option');
    button.type = 'button';
    button.dataset.choice = option.option;
    button.append(element('span', `Opção ${option.option}`), element('p', option.text));
    return button;
  }));
  document.querySelectorAll('.option').forEach((button) => button.addEventListener('click', () => {
    choice = button.dataset.choice;
    document.querySelectorAll('.option').forEach((itemButton) => itemButton.classList.toggle('selected', itemButton === button));
  }));
  const criteriaRoot = document.querySelector('#criteria');
  criteriaRoot.replaceChildren(...criteria.map((name) => {
    const label = element('label', name.replaceAll('_', ' '));
    const input = element('input');
    Object.assign(input, { name, type: 'range', min: '1', max: '5', value: '3' });
    label.append(input, element('output', '3'));
    return label;
  }));
  document.querySelectorAll('input[type=range]').forEach((input) => input.addEventListener('input', () => { input.nextElementSibling.value = input.value; }));
  document.querySelector('#reveal').hidden = true;
}

document.querySelector('#vote').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!choice) return;
  const values = Object.fromEntries(criteria.map((name) => [name, Number(document.querySelector(`[name="${name}"]`).value)]));
  await fetch('/api/bakeoff/vote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ case_id: current().case_id, choice, criteria: values }) });
  const reveal = await (await fetch(`/api/bakeoff/reveal?case_id=${current().case_id}`)).json();
  document.querySelector('#reveal').hidden = false;
  document.querySelector('#reveal').textContent = `Voto registrado. A opção escolhida corresponde a ${reveal.reveal.mapping[choice]}.`;
  choice = null;
  if (index + 1 < bundle.cases.length) setTimeout(() => { index += 1; render(); }, 900);
});

fetch('/api/bakeoff').then((response) => response.json()).then((value) => { bundle = value; render(); });

