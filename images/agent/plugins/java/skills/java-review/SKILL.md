---
name: java-review
description: "Load in a review session when the diff touches Java — Spring Boot, Quarkus or plain. The findings that matter in a Java change, in the order to look for them: injection and secrets, error handling, layering and transactions, data access and pagination, concurrency in singletons, tests, and the state-machine rules of payment and event-driven code."
---

# Reviewing a Java change

1. Read the build file for the framework and the Java version, then `git diff -- '*.java'` and the
   changed resources and migrations. Review what changed; a fix you want is a finding, never an edit.
2. Critical, security: string concatenation in any query (`@Query`, JdbcTemplate, JDBI, Panache,
   `createNativeQuery`); user input reaching `ProcessBuilder`, `Runtime.exec`, `ScriptEngine.eval`, a
   `File` or `Paths.get` without canonical-path validation; a secret in source; a password, token or
   card number in a log line; a request body without `@Valid`; CSRF disabled without a written reason.
   Any of these blocks the change and belongs in the security engineer's findings too.
3. Critical, error handling: an empty catch or a `catch (Exception e)` that swallows; `Optional.get()`
   without a guard; exception handling scattered across controllers instead of one
   `@RestControllerAdvice` or `ExceptionMapper`; a 200 with a null body where 404 belongs; a missing
   201 on creation.
4. High, architecture: field injection where the constructor should be; business logic in a
   controller or resource; `@Transactional` on the wrong layer or missing `readOnly` on reads; a JPA
   or Panache entity on the wire; in Quarkus a `@Singleton` that should be `@ApplicationScoped`, or
   blocking I/O on the event loop.
5. High, data access: `FetchType.EAGER` on a collection or an N+1 loop; a list endpoint without
   pagination; a mutating `@Query` without `@Modifying` and a transaction; `CascadeType.ALL` with
   `orphanRemoval` and no stated intent; a new query without its index; a migration edited in place
   instead of a new one.
6. Medium: a mutable non-final field in a singleton bean; `@Async` or `CompletableFuture` without a
   bounded executor; a long `@Scheduled` method on the scheduler thread; string concatenation in a
   loop; raw generics; `instanceof` followed by a cast; a service returning null instead of
   `Optional`.
7. Medium, tests: `@SpringBootTest` or `@QuarkusTest` where a slice or plain Mockito would do;
   `Thread.sleep` instead of Awaitility; a test whose name says nothing about the behaviour; a
   criterion with no test at the layer that can prove it.
8. Payment and event-driven code: the idempotency key checked before any state changes; every state
   transition guarded; compensation that cannot half-succeed; retries with jitter; a dead-letter or
   nack path for events that keep failing.
9. Verdict: a finding from steps 2 to 5 means request_changes; medium findings alone can go with an
   approve that names them. Cite the file and line for every finding.
