-- Migration: Add subscription system tables
-- Created: 2026-02-03

-- Subscription plans table
CREATE TABLE `subscription_plans` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `price_monthly` DECIMAL(10, 2) NOT NULL,
  `price_yearly` DECIMAL(10, 2),
  `stripe_price_id_monthly` VARCHAR(255),
  `stripe_price_id_yearly` VARCHAR(255),
  `features` JSON,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Subscriptions table
CREATE TABLE `subscriptions` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `plan_id` INT NOT NULL,
  `stripe_customer_id` VARCHAR(255),
  `stripe_subscription_id` VARCHAR(255),
  `status` ENUM('active', 'canceled', 'past_due', 'trialing', 'incomplete') NOT NULL,
  `current_period_start` TIMESTAMP NULL,
  `current_period_end` TIMESTAMP NULL,
  `cancel_at_period_end` BOOLEAN DEFAULT FALSE,
  `trial_end` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_stripe_customer_id` (`stripe_customer_id`),
  INDEX `idx_stripe_subscription_id` (`stripe_subscription_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payment history table
CREATE TABLE `payment_history` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `subscription_id` INT NOT NULL,
  `stripe_payment_intent_id` VARCHAR(255),
  `amount` DECIMAL(10, 2) NOT NULL,
  `currency` VARCHAR(3) DEFAULT 'BRL',
  `status` ENUM('succeeded', 'pending', 'failed') NOT NULL,
  `payment_method` VARCHAR(50),
  `paid_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`),
  INDEX `idx_subscription_id` (`subscription_id`),
  INDEX `idx_stripe_payment_intent_id` (`stripe_payment_intent_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default Premium plan
INSERT INTO `subscription_plans` (`name`, `description`, `price_monthly`, `price_yearly`, `features`) VALUES
('Premium', 'Acesso completo a todas as avaliações e receitas', 19.90, 199.00, 
 '["Todas as avaliações de vinhos", "Receitas exclusivas", "Harmonizações detalhadas", "Sem anúncios", "Suporte prioritário"]');
