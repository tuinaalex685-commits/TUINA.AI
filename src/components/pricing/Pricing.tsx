"use client";

import React from "react";
import { motion } from "framer-motion";
import styles from "./Pricing.module.css";
import { Crown, Check } from "lucide-react";

export default function Pricing() {
  const whatsappNumber = "22657138126";
  const message = "Bonjour, je souhaite m'abonner à Tuina.ai Premium (2500 FCFA/mois). Comment puis-je procéder au paiement par Mobile Money ?";
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

  return (
    <section className={styles.pricingSection} id="pricing">
      <div className={styles.content}>
        <motion.h2 
          className={styles.title}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          L'excellence a un prix abordable.
        </motion.h2>
        <motion.p 
          className={styles.subtitle}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          Passez à la vitesse supérieure et débloquez tout le potentiel de votre Professeur Universitaire Virtuel.
        </motion.p>

        <div className={styles.pricingCards}>
          <motion.div 
            className={styles.card}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, type: "spring", stiffness: 50 }}
          >
            <div className={styles.popularBadge}>Recommandé</div>
            
            <div className={styles.headerIcon}>
              <Crown size={32} />
            </div>

            <h3 className={styles.planName}>Pass Premium</h3>
            <div className={styles.price}>
              2500 <span className={styles.currency}>FCFA</span> <span className={styles.duration}>/ mois</span>
            </div>
            <p className={styles.description}>
              L'accès complet à l'intelligence juridique de Tuina.ai pour majorer vos examens.
            </p>
            
            <ul className={styles.featuresList}>
              <li className={styles.featureItem}>
                <Check className={styles.checkIcon} size={24} />
                Études Guidées illimitées
              </li>
              <li className={styles.featureItem}>
                <Check className={styles.checkIcon} size={24} />
                Évaluations personnalisées (Cas pratiques, QCM)
              </li>
              <li className={styles.featureItem}>
                <Check className={styles.checkIcon} size={24} />
                Correction de rédactions par l'IA
              </li>
              <li className={styles.featureItem}>
                <Check className={styles.checkIcon} size={24} />
                Accès prioritaire sans file d'attente
              </li>
            </ul>

            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={styles.ctaBtn}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.487-1.761-1.66-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              S'abonner via WhatsApp
            </a>
          </motion.div>
        </div>

        <motion.div 
          className={styles.workflowSteps}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          <div className={styles.step}>
            <span className={styles.stepNumber}>1</span>
            Contactez-nous
          </div>
          <div className={styles.step}>
            <span className={styles.stepNumber}>2</span>
            Payez par Mobile Money
          </div>
          <div className={styles.step}>
            <span className={styles.stepNumber}>3</span>
            Recevez votre code
          </div>
        </motion.div>
      </div>
    </section>
  );
}
