-- Store the generated "Show example" model answer alongside its writing prompt,
-- so every example is linked to the exact prompt + conseils (tips) it was
-- generated against. One row = prompt + word_target + tips + level + example.
ALTER TABLE writing_prompts ADD COLUMN IF NOT EXISTS example text;
