/**
 * INKA CORP - Utilidades de Imagen y Storage
 * Funciones para compresión y subida de comprobantes de pago
 */

// ==========================================
// CONFIGURACIÓN
// ==========================================
const STORAGE_BUCKET = 'inkacorp';
const COMPRESSION_CONFIG = {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 0.75,
    mimeType: 'image/jpeg'
};

// ==========================================
// COMPRESIÓN DE IMAGEN
// ==========================================

/**
 * Comprime una imagen usando Canvas API
 * Si la compresión aumenta el tamaño, retorna el archivo original
 * 
 * @param {File} file - Archivo de imagen a comprimir
 * @param {Object} options - Opciones de compresión
 * @returns {Promise<{blob: Blob, wasCompressed: boolean, originalSize: number, compressedSize: number}>}
 */
async function compressImage(file, options = {}) {
    const config = { ...COMPRESSION_CONFIG, ...options };
    const originalSize = file.size;

    // Si no es imagen, retornar original
    if (!file.type.startsWith('image/')) {
        console.warn('compressImage: El archivo no es una imagen');
        return {
            blob: file,
            wasCompressed: false,
            originalSize,
            compressedSize: originalSize
        };
    }

    return new Promise((resolve) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.onload = () => {
                // Calcular nuevas dimensiones manteniendo proporción
                let { width, height } = img;

                if (width > config.maxWidth) {
                    height = (height * config.maxWidth) / width;
                    width = config.maxWidth;
                }

                if (height > config.maxHeight) {
                    width = (width * config.maxHeight) / height;
                    height = config.maxHeight;
                }

                // Crear canvas y dibujar imagen redimensionada
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // Convertir a blob
                canvas.toBlob((blob) => {
                    const compressedSize = blob.size;

                    // Si la compresión aumentó el tamaño, usar original
                    if (compressedSize >= originalSize) {
                        console.log(`compressImage: Compresión ineficiente (${originalSize} -> ${compressedSize} bytes). Usando original.`);
                        resolve({
                            blob: file,
                            wasCompressed: false,
                            originalSize,
                            compressedSize: originalSize
                        });
                    } else {
                        const savedPercent = Math.round((1 - compressedSize / originalSize) * 100);
                        console.log(`compressImage: Comprimido ${savedPercent}% (${originalSize} -> ${compressedSize} bytes)`);
                        resolve({
                            blob,
                            wasCompressed: true,
                            originalSize,
                            compressedSize
                        });
                    }
                }, config.mimeType, config.quality);
            };

            img.onerror = () => {
                console.error('compressImage: Error al cargar imagen');
                resolve({
                    blob: file,
                    wasCompressed: false,
                    originalSize,
                    compressedSize: originalSize
                });
            };

            img.src = e.target.result;
        };

        reader.onerror = () => {
            console.error('compressImage: Error al leer archivo');
            resolve({
                blob: file,
                wasCompressed: false,
                originalSize,
                compressedSize: originalSize
            });
        };

        reader.readAsDataURL(file);
    });
}

// ==========================================
// SUBIDA A SUPABASE STORAGE
// ==========================================

/**
 * Sube un comprobante de pago a Supabase Storage
 * Comprime la imagen automáticamente antes de subir
 * 
 * @param {File} file - Archivo a subir
 * @param {string} creditoId - ID del crédito
 * @param {number|string} cuotaNumero - Número de cuota (opcional)
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
async function uploadReceiptToStorage(file, creditoId, cuotaNumero = '') {
    try {
        const supabase = window.getSupabaseClient();

        if (!supabase) {
            throw new Error('Cliente Supabase no disponible');
        }

        // Comprimir imagen
        const { blob, wasCompressed, originalSize, compressedSize } = await compressImage(file);

        // Generar nombre único de archivo
        const timestamp = Date.now();
        const extension = file.type === 'image/png' ? 'png' : 'jpg';
        const cuotaSuffix = cuotaNumero ? `_cuota${cuotaNumero}` : '';
        const fileName = `pagos/${creditoId}/${timestamp}${cuotaSuffix}.${extension}`;

        console.log(`uploadReceiptToStorage: Subiendo ${fileName} (${compressedSize} bytes, comprimido: ${wasCompressed})`);

        // Subir a Storage
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(fileName, blob, {
                cacheControl: '3600',
                upsert: false,
                contentType: blob.type || 'image/jpeg'
            });

        if (error) {
            console.error('uploadReceiptToStorage: Error al subir:', error);
            throw error;
        }

        // Obtener URL pública
        const { data: urlData } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(fileName);

        const publicUrl = urlData?.publicUrl;

        if (!publicUrl) {
            throw new Error('No se pudo obtener URL pública');
        }

        console.log(`uploadReceiptToStorage: Subido exitosamente -> ${publicUrl}`);

        return {
            success: true,
            url: publicUrl,
            wasCompressed,
            originalSize,
            compressedSize
        };

    } catch (error) {
        console.error('uploadReceiptToStorage: Error:', error);
        return {
            success: false,
            error: error.message || 'Error al subir comprobante'
        };
    }
}

/**
 * Genera preview de imagen en un elemento
 * 
 * @param {File} file - Archivo de imagen
 * @param {HTMLImageElement} imgElement - Elemento img donde mostrar preview
 * @returns {Promise<void>}
 */
function showImagePreview(file, imgElement) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            reject(new Error('No es una imagen válida'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            imgElement.src = e.target.result;
            resolve();
        };
        reader.onerror = () => reject(new Error('Error al leer imagen'));
        reader.readAsDataURL(file);
    });
}

// Exportar funciones para uso global
window.compressImage = compressImage;
window.uploadReceiptToStorage = uploadReceiptToStorage;
window.showImagePreview = showImagePreview;
