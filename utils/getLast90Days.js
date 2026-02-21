export default function getLast90Days() {
  const result = [];
  const today = new Date();

  for (let i = 90; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    result.push(`${year}-${month}-${day}`);
  }

  return result;
}
