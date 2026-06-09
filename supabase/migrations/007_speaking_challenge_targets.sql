-- Speaking challenges now include practice targets: a grammar structure and a
-- set of vocabulary words the learner should use, which the Parisian's opening
-- question is designed to elicit.
ALTER TABLE speaking_prompts ADD COLUMN IF NOT EXISTS target_grammar jsonb DEFAULT NULL;
ALTER TABLE speaking_prompts ADD COLUMN IF NOT EXISTS target_vocab jsonb DEFAULT NULL;
