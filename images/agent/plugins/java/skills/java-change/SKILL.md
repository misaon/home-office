---
name: java-change
description: Load in a work session when the repository builds with Gradle or Maven — a Spring Boot, Quarkus or plain Java project. How to build and test it inside a Home Office sandbox, what a dependency change must carry, which framework rules the reviewers of Java apply, and how to fix a failing build one error at a time.
---

# Changing a Java project

1. Find the build first: `settings.gradle(.kts)` or `pom.xml` at the module root names the tool, and
   `./gradlew` or `./mvnw` beside it is the way to run it; use the installed `gradle` or `mvn` only
   when no wrapper is committed. Read the build file for the framework (`spring-boot` or `quarkus`),
   the Java version it asks for (a toolchain, `release`, `sourceCompatibility`) and the checks it
   binds: formatter, Checkstyle, coverage floor, dependency locks. JDK 17, 21 and 25 are installed,
   Gradle and Maven toolchains find them, and JAVA_HOME is 21.
2. Warm nothing by hand: the first build downloads the wrapper's distribution and every dependency
   into /work/.cache, which the floor's sessions and the office's check container share. Never reach
   for `--refresh-dependencies`, `-U` or `clean install` to make a resolution error go away; read
   which coordinate failed and why.
3. A dependency change goes where the project keeps versions — a version catalog, a BOM, the parent
   POM — and carries whatever the build verifies: a lockfile, verification metadata, a licence
   allowlist. Regenerate those only for the change you made, with the project's own command, and say
   so in the report. A verification failure on a dependency you did not touch is a finding to report,
   never a reason to regenerate.
4. Follow the framework's shape rather than habit: constructor injection over field `@Autowired`;
   business logic in services, controllers and resources delegate; `@Transactional` on the service
   layer, read-only for reads; DTOs or records on the wire, never entities; `@Valid` on every request
   body; `Optional` chains over `.get()`; pagination on list endpoints; no `FetchType.EAGER` on
   collections; queries with bind parameters only; no secret in source or in a log line. In Quarkus,
   `@ApplicationScoped` over `@Singleton`, `@Blocking` or the reactive client for blocking work on
   the event loop, and Panache as active record or repository, not both.
5. Test at the lowest layer that proves the criterion: plain JUnit 5 with Mockito for logic,
   `@WebMvcTest` or `@DataJpaTest` for one slice, `@SpringBootTest` or `@QuarkusTest` only for what
   needs the whole context. Name tests for the behaviour they prove, and wait with Awaitility, never
   `Thread.sleep`. A suite that starts containers (Testcontainers, Dev Services) needs the Docker
   engine a Services line names; without one, run the rest and name the skipped suites in the report.
6. When the build fails, read the first error, not the last line: `cannot find symbol` and
   `package does not exist` are an import or a missing dependency; `incompatible types` a wrong type
   or cast; `No qualifying bean` a missing annotation or component scan; `Failed to configure a
DataSource` a driver or a property; `Source option X is no longer supported` the Java version in
   the build file. Fix one error at a time and rebuild; after three attempts at the same error, stop
   and report what you learned instead of widening the change.
7. Before you report, run the formatter and the checks the build binds (`spotlessApply` or the
   formatter goal, then `check` or `verify`), then the floor's check command exactly as given. Commit
   the formatter's output with the change, never a configuration change that silences a check.
