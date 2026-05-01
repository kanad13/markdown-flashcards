const DIFFICULTY_MIN = 0;
const DIFFICULTY_MAX = 5;
const DEFAULT_DIFFICULTY = 3;

function isCurrentDifficulty(value) {
	const number = Number(value);
	return (
		Number.isInteger(number) &&
		number >= DIFFICULTY_MIN &&
		number <= DIFFICULTY_MAX
	);
}

module.exports = {
	DEFAULT_DIFFICULTY,
	DIFFICULTY_MAX,
	DIFFICULTY_MIN,
	isCurrentDifficulty,
};
