const path = require("node:path");

const express = require("express");

const { initializeCardsRepository } = require("./src/startup");
const {
	SessionStateError,
	createSessionPayload,
	createSessionState,
	getCardById,
	markCardReviewed,
	toApiCard,
	updateCardDifficulty,
	writeCardsModel,
} = require("./src/session");

const PORT = Number(process.env.PORT || 54123);

function createApp({
	rootDir = __dirname,
	repositoryState,
	now = () => new Date(),
}) {
	const app = express();

	app.disable("x-powered-by");
	app.use(express.json());

	app.locals.runtimeState = {
		cardsFilePath: repositoryState.cardsFilePath,
		model: repositoryState.model,
		now,
		session: repositoryState.session,
	};

	app.use("/assets", express.static(path.join(rootDir, "assets")));
	app.use(express.static(path.join(rootDir, "public")));

	app.get("/api/session", (request, response) => {
		const runtimeState = request.app.locals.runtimeState;
		response.json(
			createSessionPayload(runtimeState.model, runtimeState.session, {
				now: runtimeState.now,
			}),
		);
	});

	app.patch(
		"/api/cards/:cardId/difficulty",
		async (request, response, next) => {
			try {
				const runtimeState = request.app.locals.runtimeState;
				const nextState = updateCardDifficulty(
					runtimeState.model,
					request.params.cardId,
					request.body?.difficulty,
				);

				runtimeState.model = await writeCardsModel(
					runtimeState.cardsFilePath,
					nextState.model,
				);

				response.json({
					card: toApiCard(
						getCardById(runtimeState.model, request.params.cardId).card,
					),
					session: createSessionPayload(
						runtimeState.model,
						runtimeState.session,
						{
							now: runtimeState.now,
						},
					).session,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	app.post("/api/cards/:cardId/review", async (request, response, next) => {
		try {
			const runtimeState = request.app.locals.runtimeState;
			const nextState = markCardReviewed(
				runtimeState.model,
				request.params.cardId,
				{
					now: runtimeState.now,
				},
			);

			runtimeState.model = await writeCardsModel(
				runtimeState.cardsFilePath,
				nextState.model,
			);

			response.json({
				card: toApiCard(
					getCardById(runtimeState.model, request.params.cardId).card,
				),
				session: createSessionPayload(
					runtimeState.model,
					runtimeState.session,
					{
						now: runtimeState.now,
					},
				).session,
			});
		} catch (error) {
			next(error);
		}
	});

	app.use((error, request, response, next) => {
		if (
			error instanceof SyntaxError &&
			error.status === 400 &&
			"body" in error
		) {
			response.status(400).json({
				error: "Request body must be valid JSON.",
			});
			return;
		}

		if (error instanceof SessionStateError) {
			response.status(error.statusCode ?? 400).json({
				error: error.message,
				code: error.code,
			});
			return;
		}

		next(error);
	});

	return app;
}

async function startServer({
	rootDir = __dirname,
	now = () => new Date(),
	port = PORT,
	quiet = false,
	randomBytes,
	shuffleRandom = Math.random,
} = {}) {
	const startupState = await initializeCardsRepository({
		rootDir,
		now,
		randomBytes,
	});
	const repositoryState = {
		...startupState,
		session: createSessionState(startupState.model, { random: shuffleRandom }),
	};
	const app = createApp({
		rootDir,
		now,
		repositoryState,
	});

	return new Promise((resolve, reject) => {
		const server = app.listen(port);

		function handleListenError(error) {
			if (error && error.code === "EADDRINUSE") {
				error.message = `Port ${port} is already in use. Another flashcard server may already be running at http://localhost:${port}. Run \`pid=$(lsof -tiTCP:${port} -sTCP:LISTEN); [[ -n "$pid" ]] && kill "$pid" || echo "No server is listening on port ${port}."\` to stop the current server safely, or set PORT to a different value.`;
			}

			reject(error);
		}

		server.once("error", handleListenError);
		server.once("listening", () => {
			server.off("error", handleListenError);
			const address = server.address();
			const actualPort =
				typeof address === "object" && address ? address.port : port;

			if (!quiet) {
				console.log(
					`Flashcard app listening at http://localhost:${actualPort}`,
				);
			}

			resolve({
				app,
				repositoryState: app.locals.runtimeState,
				server,
			});
		});
	});
}

if (require.main === module) {
	startServer().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}

module.exports = {
	PORT,
	createApp,
	startServer,
};
