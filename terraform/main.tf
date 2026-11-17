# shortcut: one-shot recovery imports for resources created by the first partial CI apply (delete these blocks after the first green apply)
import {
  to = cloudflare_d1_database.newsroom
  id = "8fda878e695582341e9736656cb947ad/44c4996d-cf4e-43d8-bdfc-f0f9957f6bba"
}

import {
  to = cloudflare_workers_script.newsroom
  id = "8fda878e695582341e9736656cb947ad/newsroom"
}

import {
  to = cloudflare_workers_cron_trigger.hourly
  id = "8fda878e695582341e9736656cb947ad/newsroom"
}

import {
  to = cloudflare_workers_custom_domain.panel
  id = "8fda878e695582341e9736656cb947ad/f19d0cebb8c33785264a9604613b6a16e807fed1"
}

terraform {
  required_version = ">= 1.9"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "account_id" {
  type = string
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

data "cloudflare_zone" "main" {
  filter = {
    name = "aadithpm.xyz"
  }
}

resource "cloudflare_d1_database" "newsroom" {
  account_id = var.account_id
  name       = "newsroom"
}

locals {
  worker_bundle = "${path.module}/../dist/index.js"
}

resource "cloudflare_workers_script" "newsroom" {
  account_id         = var.account_id
  script_name        = "newsroom"
  compatibility_date = "2026-11-15"
  main_module        = "index.js"
  content_file       = local.worker_bundle
  content_sha256     = filesha256(local.worker_bundle)

  bindings = [
    {
      type = "ai"
      name = "AI"
    },
    {
      type = "d1"
      name = "DB"
      id   = cloudflare_d1_database.newsroom.id
    },
    {
      # shortcut: verify `remote` attr against provider schema at first apply (spec §12.1)
      type   = "send_email"
      name   = "EMAIL"
      remote = true
    },
  ]
}

resource "cloudflare_workers_cron_trigger" "hourly" {
  account_id  = var.account_id
  script_name = cloudflare_workers_script.newsroom.script_name
  schedules = [
    {
      cron = "0 * * * *"
    },
  ]
}

resource "cloudflare_workers_custom_domain" "panel" {
  account_id = var.account_id
  zone_id    = data.cloudflare_zone.main.id
  hostname   = "digest.aadithpm.xyz"
  service    = cloudflare_workers_script.newsroom.script_name
}

# shortcut: verify name semantics (root vs subdomain) at first apply (spec §12.2)
resource "cloudflare_email_sending_subdomain" "main" {
  zone_id = data.cloudflare_zone.main.id
  name    = "aadithpm.xyz"
}

# shortcut: no IdP resource — Cloudflare allows one OTP IdP per account and the built-in implicit one already exists (un-listable, un-creatable, code 12132); leaving allowed_idps unset lets Access use it
resource "cloudflare_zero_trust_access_policy" "aadithpm_only" {
  account_id = var.account_id
  name       = "aadithpm-emails-only"
  decision   = "allow"

  include = [
    {
      email_domain = {
        domain = "aadithpm.xyz"
      }
    },
  ]
}

resource "cloudflare_zero_trust_access_application" "panel" {
  account_id = var.account_id
  name       = "newsroom panel"
  type       = "self_hosted"
  domain     = "digest.aadithpm.xyz"

  policies = [
    {
      id = cloudflare_zero_trust_access_policy.aadithpm_only.id
    },
  ]
}

output "d1_database_id" {
  value = cloudflare_d1_database.newsroom.id
}
