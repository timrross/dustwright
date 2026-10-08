# Fuzz seeds

Small hand-written hostile designs. `corpus.ts` generates the large cases (10 MB garbage, every Limits row
exceeded by one) at test time so they are not committed. Every seed must be rejected or parsed without throwing.
