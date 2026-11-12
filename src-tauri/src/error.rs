use std::fmt;

/// Error de la capa de datos: siempre un mensaje legible en español.
pub struct AppError(pub String);

pub type R<T> = Result<T, AppError>;

impl fmt::Debug for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

// AppError no implementa std::error::Error a propósito: así este impl genérico no choca con `From<T> for T`.
impl<E: std::error::Error> From<E> for AppError {
    fn from(error: E) -> Self {
        AppError(error.to_string())
    }
}

impl From<AppError> for String {
    fn from(error: AppError) -> Self {
        error.0
    }
}

pub fn err<T>(message: impl Into<String>) -> R<T> {
    Err(AppError(message.into()))
}
