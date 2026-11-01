# Family Pub Quiz — Product Requirements Document

Date: 1 November 2026  
Status: Interview complete; ready to guide implementation  
Working title: Family Pub Quiz

## Purpose

Create a simple, cheerful pub quiz for an adult family playing together in the same room. A separate host runs the game while four players answer questions individually on their own phones. The experience should be easy for family members, including grandma, uncle, and siblings, to understand and use.

## First-version success

A host can start a quiz, four players can join without accounts by scanning a QR code, and the group can complete ten questions and see the winner without needing technical help. Everyone can read the questions and tap answers comfortably.

## Confirmed scope

- One separate, non-competing host and four individual players.
- Everyone plays in the same room.
- A browser-based experience with questions displayed on each player's phone.
- Players scan a QR code and enter a name; no account is required.
- A ready-made English general-knowledge question collection, with easy-to-medium difficulty.
- Ten questions per game, each with four answer options and one correct answer.
- One point per correct answer; zero for an incorrect answer. There is no timer or speed bonus.
- The correct answer is revealed automatically once every player has answered.
- A scoreboard appears after every question.
- The host decides when to advance to the next question.
- A final winner screen supports shared wins when players tie.
- Large text and buttons, with a simple, cheerful visual design.
- If someone disconnects, the game must be restarted. Rejoining an ongoing game with preserved progress is outside the first version.

## Roles

### Host

Creates the game, displays its joining QR code, sees the player lobby, starts the quiz, and advances between questions after answers are revealed. The host does not submit answers or receive a score.

### Player

Scans the QR code, enters a name, waits in the lobby, answers questions on their phone, and views correct answers, scores, and final results.

## Game flow and functional requirements

### 1. Create and join

1. The host opens the website and creates a game.
2. The host sees a lobby with a QR code and the names of joined players.
3. Each player scans the code to open that game's join page on their phone.
4. Each player enters a name and joins the lobby without registering or signing in.
5. The host starts once all four players have joined.

### 2. Answer a question

1. All players receive the same question and its four answer options.
2. The interface shows progress, such as “Question 3 of 10.”
3. Players select an answer at their own pace, without a countdown.
4. Each player can submit only one answer per question.
5. After submitting, the player sees confirmation and waits for everyone else.
6. The correct answer remains hidden until all four players have answered.
7. The host can see how many players have answered.

### 3. Reveal and advance

1. Once all four answers are submitted, the game reveals the correct answer automatically.
2. Each player can see whether their answer was correct.
3. Correct answers add one point, exactly once.
4. All participants can see a scoreboard with player names and cumulative scores.
5. The game stays on the reveal and scoreboard until the host advances.
6. The host advances to the next question, repeating until all ten are complete.

### 4. Finish

After the tenth reveal, the host advances to final results. The final screen displays all scores and identifies the highest-scoring player or all tied winners. There is no tie-breaker question.

### 5. Handle disconnections

When a participant loses their connection, display a clear interruption message and require a fresh game. Do not silently continue with fewer players or promise recovery of an interrupted game's scores. Provide a straightforward way for the host to restart and for players to join again.

## Question collection

- Supply a ready-made collection; the host does not write or edit questions in this version.
- Use English, general-knowledge topics, and easy-to-medium difficulty suitable for adults across generations.
- Every question must have exactly four distinct options and one unambiguous correct answer.
- Check question accuracy before release and avoid relying on facts that change frequently.
- A game must contain ten distinct questions.

## Usability requirements

- Prioritize mobile readability and large, clearly labeled answer buttons.
- Use plain English instructions and clear waiting, submitted, reveal, and finished states.
- Show correctness with text or symbols as well as color.
- Clearly distinguish the host's controls from player actions.
- Ensure host and player screens remain synchronized throughout the game.
- Do not expose correct answers to players before the reveal phase.

## Acceptance criteria

1. A host can create a game and show a working QR code for its join page.
2. Four players can scan that code, enter names, and join using separate phones without accounts.
3. The host can start a game after all four players join and does not appear in the player scoreboard.
4. The game presents ten distinct English multiple-choice questions, with four options each.
5. A player can wait without a timeout, submit one answer, and see that submission acknowledged.
6. An answer cannot be changed or counted again after submission.
7. The correct answer remains hidden while any player has yet to answer, then appears automatically once all four have submitted.
8. Each correct answer adds exactly one point; incorrect answers add none. Scores range from zero to ten.
9. A cumulative scoreboard appears after each question, and the next question waits for the host's action.
10. Final results identify a sole winner or all players tied for the highest score.
11. A detected disconnection interrupts the game with clear instructions to restart; a new game begins with zero scores.
12. The complete flow is usable on four phones plus the host's device, with readable text and comfortably tappable buttons.

## Outside first-version scope

- Remote play across different homes.
- Teams, a competing host, and configurable player counts.
- User accounts, profiles, and saved game history.
- Host-written questions, question editing, and category selection.
- Timers, speed-based scoring, typed answers, and tie-breaker rounds.
- Reconnection recovery, resuming interrupted games, and removing absent players to continue.
- Native mobile apps.

## Implementation assumptions and decisions still open

The following are practical defaults or implementation details, not additional interview decisions:

- Treat four players as the required player count for the first version.
- Lock an answer on the player's first selection, with clear wording that tapping submits it.
- Give the host a question and reveal view alongside progress and navigation controls.
- Keep the first question collection small and curated; its size and question-selection method remain to be chosen. Ten distinct questions are the minimum needed for a game.
- Choose the hosting setup, network requirements, technology, supported browser versions, and connection-loss detection behavior during implementation. Same-room play does not imply offline operation.
- Define name validation and duplicate-name handling during implementation so the scoreboard is unambiguous.
- Store only the information needed to run the game; persistence and cleanup details remain to be chosen.

## Implementation decisions (1 November 2026)

- **Hosting:** static site on GitHub Pages. The host's browser tab acts as the game server; phones connect to it directly over WebRTC using PeerJS (its free public broker is used only to introduce devices). The host tab must stay open.
- **Host screen:** a laptop or TV that shows the QR code, each question, how many players have answered, the reveal, the scoreboard, and the host controls.
- **Questions:** a curated bank of about 50 questions; each game picks 10 at random without repeats and shuffles the answer order.
- **Disconnections:** a phone that drops gets a 15-second grace period to reconnect from the same browser tab and carry on. If it stays away, the game is interrupted for everyone. In the lobby, a player who stays away is simply removed.
- **Names:** required, up to 15 characters; duplicate names (ignoring capitals) are refused.
- **Answers:** the first tap locks in the answer; the screen says so before the player taps.
- **Restart:** "Play again" / "Start a new game" keeps the same QR code; phones still on the page show the join form again, and scores start from zero.
- **Technology:** plain HTML, CSS and JavaScript with no build step. Game state lives only in the host tab's memory.

## Suggested delivery order

1. Build the lobby, QR-code joining, and host/player roles.
2. Add the curated questions and synchronized answer/reveal flow.
3. Add scoring, scoreboards, final results, and restart behavior.
4. Verify the full experience with four phones and a separate host device, including a tie and a disconnection.

This document records the product interview. Implementation has not started.
